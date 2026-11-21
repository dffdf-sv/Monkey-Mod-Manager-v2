use directories::{ProjectDirs, UserDirs};
use eframe::{egui, App};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, time::Duration};

const MOD_REPO: &str = "dffdf-sv/GORILA-TAG-MODBASE";
const CATALOGUE_FILE: &str = "modinfo.Json";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct ModEntry {
    #[serde(default)] id: String,
    name: String,
    #[serde(default)] author: String,
    #[serde(default)] category: String,
    #[serde(default)] description: String,
    #[serde(default)] version: String,
    #[serde(default, alias = "download_url")] download_url: String,
    #[serde(default, alias = "image_url")] image_url: String,
    #[serde(default, alias = "source_url")] source_url: String,
    #[serde(default)] dependencies: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Profile {
    name: String,
    #[serde(default)] enabled_mods: Vec<String>,
    #[serde(default)] configs: std::collections::BTreeMap<String, String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct Settings {
    game_path: String,
    #[serde(default)] selected_profile: String,
    #[serde(default)] profiles: Vec<Profile>,
    #[serde(default)] installed: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Page { Discover, Installed, Profiles, Config, Settings }

struct ModHub {
    settings: Settings,
    page: Page,
    catalogue: Vec<ModEntry>,
    search: String,
    status: String,
    config_text: String,
    profile_name: String,
}

impl ModHub {
    fn new() -> Self {
        let settings = Self::load_settings();
        Self {
            settings, page: Page::Discover, catalogue: vec![], search: String::new(),
            status: "Ready. Choose your Gorilla Tag folder in Settings.".into(),
            config_text: String::new(), profile_name: String::new(),
        }
    }

    fn settings_file() -> PathBuf {
        ProjectDirs::from("com", "ModHub", "ModHub").map(|p| p.config_dir().join("settings.json"))
            .unwrap_or_else(|| PathBuf::from("modhub-settings.json"))
    }
    fn load_settings() -> Settings {
        fs::read(Self::settings_file()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }
    fn save_settings(&self) {
        let path = Self::settings_file();
        if let Some(parent) = path.parent() { let _ = fs::create_dir_all(parent); }
        if let Ok(data) = serde_json::to_vec_pretty(&self.settings) { let _ = fs::write(path, data); }
    }
    fn game_dir(&self) -> PathBuf { PathBuf::from(&self.settings.game_path) }
    fn mods_dir(&self) -> PathBuf { self.game_dir().join("BepInEx").join("plugins") }
    fn discover_game(&mut self) {
        let mut candidates = vec![];
        if let Some(user) = UserDirs::new() {
            candidates.push(user.home_dir().join("AppData/LocalLow/"));
            candidates.push(user.home_dir().join(".steam/steam/steamapps/common/Gorilla Tag"));
            candidates.push(user.home_dir().join(".local/share/Steam/steamapps/common/Gorilla Tag"));
        }
        if let Some(program_files) = std::env::var_os("ProgramFiles(x86)") {
            candidates.push(PathBuf::from(program_files).join("Steam/steamapps/common/Gorilla Tag"));
        }
        let found = candidates.into_iter().find(|p| p.join("Gorilla Tag.exe").exists() || p.join("Gorilla Tag").exists());
        if let Some(path) = found { self.settings.game_path = path.display().to_string(); self.save_settings(); self.status = "Detected game directory.".into(); }
        else { self.status = "Couldn't auto-detect. Enter the game folder path below.".into(); }
    }
    fn load_catalogue(&mut self) {
        self.status = "Fetching catalogue…".into();
        let client = Client::builder().timeout(Duration::from_secs(20)).user_agent("ModHub-Rust").build();
        let result = client.and_then(|client| client.get(format!("https://api.github.com/repos/{MOD_REPO}/contents/{CATALOGUE_FILE}")).send()?.error_for_status()?.json::<serde_json::Value>());
        match result {
            Ok(json) => {
                let raw = json.get("content").and_then(|v| v.as_str()).unwrap_or("");
                let decoded = decode_github_content(raw);
                match decoded.and_then(|s| serde_json::from_str::<Vec<ModEntry>>(&s).map_err(|e| e.to_string())) {
                    Ok(mods) => { self.catalogue = mods; self.status = format!("Loaded {} catalogue mods.", self.catalogue.len()); }
                    Err(e) => self.status = format!("Catalogue parse failed: {e}"),
                }
            }
            Err(e) => self.status = format!("Catalogue fetch failed: {e}"),
        }
    }
    fn install_mod(&mut self, entry: &ModEntry) {
        let url = entry.download_url.trim();
        if !url.starts_with("https://") { self.status = "Blocked download: only HTTPS links are accepted.".into(); return; }
        let target = self.mods_dir();
        if let Err(e) = fs::create_dir_all(&target) { self.status = format!("Cannot create plugins folder: {e}"); return; }
        let client = match Client::builder().timeout(Duration::from_secs(90)).user_agent("ModHub-Rust").build() { Ok(c)=>c, Err(e)=>{self.status=e.to_string();return;} };
        match client.get(url).send().and_then(|r| r.error_for_status()).and_then(|r| r.bytes()) {
            Ok(bytes) => {
                let safe_name = clean_name(if entry.name.is_empty() { "mod" } else { &entry.name });
                if url.to_ascii_lowercase().ends_with(".zip") || bytes.starts_with(b"PK") {
                    match zip::ZipArchive::new(std::io::Cursor::new(bytes)) {
                        Ok(mut archive) => {
                            let dest = target.join(&safe_name);
                            let mut extracted = 0usize;
                            for i in 0..archive.len() {
                                if let Ok(mut file) = archive.by_index(i) {
                                    let Some(relative) = file.enclosed_name().map(|p| p.to_path_buf()) else { continue };
                                    let out = dest.join(relative);
                                    if file.is_dir() { let _=fs::create_dir_all(&out); continue; }
                                    if let Some(parent)=out.parent(){let _=fs::create_dir_all(parent);}
                                    if let Ok(mut output)=fs::File::create(&out) {
                                        if std::io::copy(&mut file,&mut output).is_ok(){extracted+=1;}
                                    }
                                }
                            }
                            self.status = format!("Installed {} ZIP files for {}.", extracted, entry.name);
                        }
                        Err(e) => self.status = format!("Invalid ZIP: {e}"),
                    }
                } else if bytes.starts_with(b"MZ") || url.to_ascii_lowercase().ends_with(".dll") {
                    match fs::write(target.join(format!("{safe_name}.dll")), &bytes) {
                        Ok(_) => self.status = format!("Installed {}.", entry.name),
                        Err(e) => self.status = format!("Install failed: {e}"),
                    }
                } else { self.status = "Downloaded file is not a DLL or ZIP. Nothing installed.".into(); }
                if !self.settings.installed.contains(&entry.name) { self.settings.installed.push(entry.name.clone()); }
                self.save_settings();
            }
            Err(e) => self.status = format!("Download failed: {e}"),
        }
    }
    fn installed_files(&self) -> Vec<PathBuf> {
        fs::read_dir(self.mods_dir()).ok().into_iter().flatten().filter_map(|e| e.ok().map(|e|e.path())).collect()
    }
    fn current_profile_mut(&mut self) -> Option<&mut Profile> {
        self.settings.profiles.iter_mut().find(|p| p.name == self.settings.selected_profile)
    }
    fn create_profile(&mut self) {
        let name = self.profile_name.trim().to_string();
        if name.is_empty() || self.settings.profiles.iter().any(|p| p.name.eq_ignore_ascii_case(&name)) { return; }
        self.settings.profiles.push(Profile{name:name.clone(), ..Default::default()});
        self.settings.selected_profile = name;
        self.profile_name.clear();
        self.save_settings();
    }
}

impl App for ModHub {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        egui::TopBottomPanel::top("top").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("ModHub");
                ui.separator();
                ui.label("Native Rust edition");
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.label(&self.status);
                });
            });
        });
        egui::SidePanel::left("nav").resizable(false).default_width(150.0).show(ctx, |ui| {
            ui.add_space(8.0);
            for (label, page) in [("Discover",Page::Discover),("Installed",Page::Installed),("Profiles",Page::Profiles),("Configs",Page::Config),("Settings",Page::Settings)] {
                if ui.selectable_label(self.page==page,label).clicked() { self.page=page; }
            }
        });
        egui::CentralPanel::default().show(ctx, |ui| match self.page {
            Page::Discover => {
                ui.heading("Mod catalogue");
                ui.horizontal(|ui| {
                    ui.text_edit_singleline(&mut self.search).hint_text("Search mods");
                    if ui.button("Refresh catalogue").clicked() { self.load_catalogue(); }
                });
                if self.catalogue.is_empty() { ui.label("Press Refresh catalogue to fetch mods from the community repository."); }
                egui::ScrollArea::vertical().show(ui, |ui| {
                    let query=self.search.to_lowercase();
                    for entry in self.catalogue.clone().into_iter().filter(|m| query.is_empty() || m.name.to_lowercase().contains(&query) || m.description.to_lowercase().contains(&query)) {
                        ui.group(|ui| {
                            ui.strong(&entry.name);
                            ui.label(format!("{}  •  {}  •  {}",entry.author,entry.category,entry.version));
                            ui.label(&entry.description);
                            if ui.button(format!("Install {}",entry.name)).clicked() { self.install_mod(&entry); }
                        });
                    }
                });
            }
            Page::Installed => {
                ui.heading("Installed mods / plugins");
                ui.label(format!("Plugin folder: {}",self.mods_dir().display()));
                let items=self.installed_files();
                if items.is_empty(){ui.label("No plugin files found. Check your game path and BepInEx installation.");}
                for p in items { ui.label(p.file_name().unwrap_or_default().to_string_lossy()); }
            }
            Page::Profiles => {
                ui.heading("Profiles");
                ui.horizontal(|ui| {
                    ui.text_edit_singleline(&mut self.profile_name).hint_text("New profile name");
                    if ui.button("Create").clicked(){self.create_profile();}
                });
                let names:Vec<String>=self.settings.profiles.iter().map(|p|p.name.clone()).collect();
                for name in names {
                    ui.horizontal(|ui|{
                        if ui.selectable_label(self.settings.selected_profile==name,&name).clicked(){self.settings.selected_profile=name.clone();self.save_settings();}
                        if ui.button("Delete").clicked(){self.settings.profiles.retain(|p|p.name!=name);if self.settings.selected_profile==name{self.settings.selected_profile.clear();}self.save_settings();}
                    });
                }
            }
            Page::Config => {
                ui.heading("Configuration editor");
                ui.label("Edit and save a profile's text config (JSON/TOML/CFG).");
                ui.add(egui::TextEdit::multiline(&mut self.config_text).desired_rows(20).code_editor());
                if ui.button("Save config to selected profile").clicked(){
                    let key="default.cfg".to_string();
                    if let Some(p)=self.current_profile_mut(){p.configs.insert(key,self.config_text.clone());self.save_settings();self.status="Config saved into profile.".into();}
                    else {self.status="Create/select a profile first.".into();}
                }
                if let Some(p)=self.settings.profiles.iter().find(|p|p.name==self.settings.selected_profile) {
                    if let Some(saved)=p.configs.get("default.cfg") { if self.config_text.is_empty(){self.config_text=saved.clone();} }
                }
            }
            Page::Settings => {
                ui.heading("Settings");
                ui.label("Gorilla Tag game directory");
                ui.text_edit_singleline(&mut self.settings.game_path);
                ui.horizontal(|ui|{
                    if ui.button("Detect game").clicked(){self.discover_game();}
                    if ui.button("Save path").clicked(){self.save_settings();self.status="Settings saved.".into();}
                });
                ui.label("Game path should contain the Gorilla Tag executable. Mods are installed into BepInEx/plugins.");
                ui.separator();
                ui.label("Native build: Rust + egui (no Electron or embedded browser).");
            }
        });
    }
}

fn clean_name(input: &str) -> String {
    let s:String=input.chars().filter(|c|c.is_ascii_alphanumeric()||*c=='-'||*c=='_').collect();
    if s.is_empty(){"mod".into()}else{s}
}
fn decode_github_content(raw: &str) -> Result<String,String> {
    let compact=raw.chars().filter(|c|!c.is_whitespace()).collect::<String>();
    let bytes=decode_base64(&compact)?;
    String::from_utf8(bytes).map_err(|e|e.to_string())
}
fn decode_base64(s:&str)->Result<Vec<u8>,String>{
    const TABLE:&[u8]=b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out=Vec::new(); let mut buf=0u32; let mut bits=0u8;
    for b in s.bytes(){if b==b'=' {break;} let v=TABLE.iter().position(|x|*x==b).ok_or("Invalid base64")? as u32; buf=(buf<<6)|v; bits+=6; if bits>=8{bits-=8;out.push((buf>>bits) as u8);}}
    Ok(out)
}
fn main() -> eframe::Result<()> {
    let options=eframe::NativeOptions { viewport:egui::ViewportBuilder::default().with_title("ModHub").with_inner_size([1050.0,700.0]), ..Default::default() };
    eframe::run_native("ModHub",options,Box::new(|_cc|Ok(Box::new(ModHub::new()))))
}
