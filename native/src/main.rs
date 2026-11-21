use directories::{ProjectDirs, UserDirs};
use eframe::{egui, App};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::Duration};

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
    #[serde(default)] bookmarks: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Page { Overview, Discover, Library, Installed, Profiles, Config, Settings }

struct ModHub {
    settings: Settings,
    page: Page,
    catalogue: Vec<ModEntry>,
    search: String,
    category: String,
    status: String,
    config_text: String,
    profile_name: String,
}

impl ModHub {
    fn new() -> Self {
        let settings = Self::load_settings();
        Self {
            settings, page: Page::Overview, catalogue: vec![], search: String::new(), category: "All Mods".into(),
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
        fn collect(dir: &PathBuf, output: &mut Vec<PathBuf>) {
            let Ok(entries) = fs::read_dir(dir) else { return };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect(&path, output);
                } else if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("dll"))
                    || path.to_string_lossy().to_ascii_lowercase().ends_with(".dll.disabled") {
                    output.push(path);
                }
            }
        }
        let mut files = Vec::new();
        collect(&self.mods_dir(), &mut files);
        files.sort();
        files
    }
    fn toggle_plugin(&mut self, path: &PathBuf) {
        let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let disabled = name.to_ascii_lowercase().ends_with(".dll.disabled");
        let mut new_path = path.clone();
        if disabled {
            new_path.set_extension("dll");
        } else {
            new_path.set_extension("dll.disabled");
        }
        match fs::rename(path, &new_path) {
            Ok(()) => {
                self.status = format!("{} {}", if disabled { "Enabled" } else { "Disabled" }, name);
                self.save_settings();
            }
            Err(e) => self.status = format!("Couldn't toggle {name}: {e}"),
        }
    }
    fn current_profile_mut(&mut self) -> Option<&mut Profile> {
        self.settings.profiles.iter_mut().find(|p| p.name == self.settings.selected_profile)
    }
    fn create_profile(&mut self) {
        let name = self.profile_name.trim().to_string();
        if name.is_empty() || self.settings.profiles.iter().any(|p| p.name.eq_ignore_ascii_case(&name)) { return; }
        let enabled_mods = self.installed_files().into_iter().filter(|p| !p.file_name().unwrap_or_default().to_string_lossy().to_ascii_lowercase().ends_with(".dll.disabled")).map(|p|p.file_name().unwrap_or_default().to_string_lossy().to_string()).collect();
        self.settings.profiles.push(Profile{name:name.clone(), enabled_mods, ..Default::default()});
        self.settings.selected_profile = name;
        self.profile_name.clear();
        self.save_settings();
    }
    fn apply_profile(&mut self, profile_name: &str) {
        let Some(profile)=self.settings.profiles.iter().find(|p|p.name==profile_name).cloned() else { self.status="Profile not found.".into(); return; };
        let desired:std::collections::HashSet<String>=profile.enabled_mods.into_iter().collect();
        let files=self.installed_files();
        let mut changed=0;
        for path in files {
            let file=path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let disabled=file.to_ascii_lowercase().ends_with(".dll.disabled");
            let active_name=if disabled { file.trim_end_matches(".disabled").to_string() } else { file.clone() };
            let should_enable=desired.contains(&active_name);
            if should_enable==disabled {
                let mut next=path.clone();
                if disabled { next.set_extension("dll"); } else { next.set_extension("dll.disabled"); }
                if fs::rename(&path,&next).is_ok(){changed+=1;}
            }
        }
        self.settings.selected_profile=profile_name.to_string();
        self.save_settings();
        self.status=format!("Applied profile '{}' ({} plugin changes).",profile_name,changed);
    }
}

impl App for ModHub {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let accent = egui::Color32::from_rgb(199, 243, 107);
        let bg = egui::Color32::from_rgb(11, 14, 18);
        let side = egui::Color32::from_rgb(16, 19, 25);
        let panel = egui::Color32::from_rgb(20, 24, 32);
        let panel2 = egui::Color32::from_rgb(25, 30, 40);
        let line = egui::Color32::from_rgb(37, 43, 54);
        let muted = egui::Color32::from_rgb(129, 138, 154);
        let mut visuals = egui::Visuals::dark();
        visuals.window_fill = panel;
        visuals.panel_fill = bg;
        visuals.extreme_bg_color = side;
        visuals.faint_bg_color = panel2;
        visuals.widgets.noninteractive.bg_fill = panel;
        visuals.widgets.noninteractive.bg_stroke = egui::Stroke::new(1.0, line);
        visuals.widgets.inactive.bg_fill = panel2;
        visuals.widgets.inactive.bg_stroke = egui::Stroke::new(1.0, line);
        visuals.widgets.inactive.fg_stroke = egui::Stroke::new(1.0, muted);
        visuals.widgets.hovered.bg_fill = egui::Color32::from_rgb(35, 43, 51);
        visuals.widgets.hovered.bg_stroke = egui::Stroke::new(1.0, accent);
        visuals.widgets.hovered.fg_stroke = egui::Stroke::new(1.0, egui::Color32::WHITE);
        visuals.widgets.active.bg_fill = accent;
        visuals.widgets.active.fg_stroke = egui::Stroke::new(1.0, bg);
        visuals.selection.bg_fill = accent;
        visuals.selection.stroke = egui::Stroke::new(1.0, bg);
        visuals.window_corner_radius = egui::CornerRadius::same(12);
        visuals.widgets.noninteractive.corner_radius = egui::CornerRadius::same(9);
        visuals.widgets.inactive.corner_radius = egui::CornerRadius::same(8);
        visuals.widgets.hovered.corner_radius = egui::CornerRadius::same(8);
        visuals.widgets.active.corner_radius = egui::CornerRadius::same(8);
        ctx.set_visuals(visuals);
        ctx.style_mut(|style| {
            style.spacing.item_spacing = egui::vec2(10.0, 10.0);
            style.spacing.button_padding = egui::vec2(12.0, 8.0);
            style.text_styles.insert(egui::TextStyle::Heading, egui::FontId::proportional(25.0));
            style.text_styles.insert(egui::TextStyle::Body, egui::FontId::proportional(14.0));
        });

        egui::TopBottomPanel::top("topbar").frame(egui::Frame::NONE.fill(bg).inner_margin(egui::Margin::symmetric(20, 12))).show(ctx, |ui| {
            ui.horizontal(|ui| {
                if ui.selectable_label(false, egui::RichText::new("Workspace").color(muted)).clicked(){self.page=Page::Overview;}
                if ui.selectable_label(self.page==Page::Profiles, "Profiles").clicked(){self.page=Page::Profiles;}
                ui.add_space(8.0);
                let game_chip=egui::Frame::new().fill(panel2).stroke(egui::Stroke::new(1.0,line)).corner_radius(16).inner_margin(egui::Margin::symmetric(10,6));
                game_chip.show(ui,|ui|{ui.horizontal(|ui|{ui.label(egui::RichText::new("●").color(accent).small());ui.label(egui::RichText::new("Gorilla Tag").small());});});
                ui.add_space(6.0);
                if ui.button("▶  Launch game").clicked(){
                    let exe=self.game_dir().join(if cfg!(windows){"Gorilla Tag.exe"}else{"Gorilla Tag"});
                    if exe.exists(){if let Err(e)=std::process::Command::new(exe).spawn(){self.status=format!("Launch failed: {e}");}}else{self.status="Set your Gorilla Tag folder in Settings first.".into();}
                }
                if self.page == Page::Discover || self.page == Page::Library {
                    ui.add_sized([210.0, 32.0], egui::TextEdit::singleline(&mut self.search).hint_text("⌕  Search mods..."));
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let avatar=ui.add_sized([28.0,28.0],egui::Button::new(egui::RichText::new("M").strong().color(bg)).fill(accent));
                    if avatar.clicked(){self.status="GitHub sign-in is not connected in the native build yet.".into();}
                    if ui.button("Sign in with GitHub").clicked(){let _=webbrowser::open("https://github.com/login");}
                    if ui.button("⚙").clicked(){self.page=Page::Settings;}
                });
            });
        });
        egui::SidePanel::left("nav").resizable(false).exact_width(214.0).frame(egui::Frame::NONE.fill(side).inner_margin(egui::Margin { left: 14, right: 14, top: 18, bottom: 14 })).show(ctx, |ui| {
            ui.vertical(|ui| {
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("🟩").size(26.0));
                    ui.add_space(4.0);
                    ui.vertical(|ui| {ui.label(egui::RichText::new("MOD").size(15.0).strong().extra_letter_spacing(2.0));ui.label(egui::RichText::new("HUB").size(9.0).extra_letter_spacing(2.0).color(muted));});
                });
                
                ui.add_space(28.0);
                ui.label(egui::RichText::new("LIBRARY").size(10.0).strong().color(muted));
                ui.add_space(8.0);
                for (icon,label,page) in [("⌂","Overview",Page::Overview),("⌕","Discover",Page::Discover),("♡","Library",Page::Library),("▣","Installed",Page::Installed),("▤","Profiles",Page::Profiles),("⚙","Configs",Page::Config)] {
                    let selected = self.page == page;
                    let text = format!("{}   {}",icon,label);
                    let response=ui.add_sized([ui.available_width(),38.0],egui::SelectableLabel::new(selected,text));
                    if selected { ui.painter().rect_filled(response.rect.shrink(1.0),8.0, panel2); ui.painter().rect_filled(egui::Rect::from_min_size(response.rect.min,egui::vec2(3.0,response.rect.height())),3.0,accent); }
                    if response.clicked(){self.page=page;}
                }
                ui.add_space(18.0);
                ui.label(egui::RichText::new("APP").size(10.0).strong().color(muted));
                ui.add_space(8.0);
                let settings_resp=ui.add_sized([ui.available_width(),38.0],egui::SelectableLabel::new(self.page==Page::Settings,"⚙   Settings"));
                if settings_resp.clicked(){self.page=Page::Settings;}
                ui.with_layout(egui::Layout::bottom_up(egui::Align::Min), |ui| {
                    ui.add_space(6.0);
                    ui.label(egui::RichText::new("NATIVE RUST EDITION").size(9.0).color(muted));
                    ui.label(egui::RichText::new("●  Ready").size(11.0).color(accent));
                    ui.add_space(10.0);
                    egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(10).inner_margin(12.0).show(ui,|ui|{
                        ui.label(egui::RichText::new("GORILLA TAG").strong().size(11.0));
                        ui.label(egui::RichText::new(if self.settings.game_path.is_empty() {"Game folder not set"} else {"Game folder configured"}).size(10.0).color(muted));
                        if ui.small_button("Open settings →").clicked(){self.page=Page::Settings;}
                    });
                });
            });
        });
        egui::CentralPanel::default().frame(egui::Frame::NONE.fill(bg).inner_margin(egui::Margin::same(22))).show(ctx, |ui| {
            match self.page {
                Page::Overview => {
                    egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(18).inner_margin(28.0).show(ui,|ui|{
                        ui.label(egui::RichText::new("GORILLA TAG MOD MANAGER").size(10.0).strong().color(accent));
                        ui.add_space(8.0);
                        ui.heading(egui::RichText::new("Make Gorilla Tag yours.").size(34.0));
                        ui.label(egui::RichText::new("Discover, manage and customise your mods from one place.").color(muted));
                        ui.add_space(18.0);
                        ui.horizontal(|ui|{
                            if ui.button("Explore mods  →").clicked(){self.page=Page::Discover;}
                            if ui.button("Install BepInEx").clicked(){self.status="BepInEx setup is coming in a later native update.".into();}
                            if ui.button("Refresh catalogue").clicked(){self.load_catalogue();}
                        });
                    });
                    ui.add_space(18.0);
                    ui.columns(3,|cols|{
                        for (i,(label,value,sub)) in [("IN CATALOG",format!("{:02} mods",self.catalogue.len()),"Community mod base"),("YOUR LIBRARY",format!("{:02} installed",self.settings.installed.len()),"Managed by ModHub"),("GAME LOCATION",if self.settings.game_path.is_empty(){"Not set".into()}else{"Configured".into()},"Set in Settings")].iter().enumerate(){
                            egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(12).inner_margin(16.0).show(&mut cols[i],|ui|{
                                ui.label(egui::RichText::new(*label).size(10.0).strong().color(muted));
                                ui.add_space(8.0);
                                ui.heading(egui::RichText::new(value).size(21.0).strong().color(accent));
                                ui.label(egui::RichText::new(*sub).small().color(muted));
                            });
                        }
                    });
                    ui.add_space(18.0);
                    ui.heading("Quick access");
                    ui.horizontal(|ui|{
                        for (label,page) in [("Discover mods",Page::Discover),("Installed mods",Page::Installed),("Profiles",Page::Profiles),("Configs",Page::Config)] {
                            if ui.add_sized([ui.available_width()/4.0-8.0,48.0],egui::Button::new(label)).clicked(){self.page=page;}
                        }
                    });
                }
                Page::Library => {
                    ui.heading("Your library");
                    ui.label(egui::RichText::new("Your bookmarked mods.").color(muted));
                    ui.add_space(12.0);
                    if self.settings.bookmarks.is_empty(){ui.label("No bookmarks yet. Browse Discover and bookmark mods.");}
                    for mod_name in self.settings.bookmarks.clone(){
                        egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(10).inner_margin(12.0).show(ui,|ui|{
                            ui.horizontal(|ui|{ui.label("▣");ui.label(egui::RichText::new(&mod_name).strong());ui.with_layout(egui::Layout::right_to_left(egui::Align::Center),|ui|{if ui.button("Remove bookmark").clicked(){self.settings.bookmarks.retain(|n|n!=&mod_name);self.save_settings();}});});
                        });
                    }
                }
                Page::Discover => {
                    egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(16).inner_margin(22.0).show(ui,|ui|{
                        ui.label(egui::RichText::new("COMMUNITY MOD LIBRARY").size(10.0).strong().color(accent));
                        ui.add_space(5.0);
                        ui.heading(egui::RichText::new("Make Gorilla Tag yours.").size(28.0));
                        ui.label(egui::RichText::new("Discover and install community mods, all from ModHub.").color(muted));
                        ui.add_space(10.0);
                        ui.horizontal(|ui|{
                            if ui.button("↻  Refresh catalogue").clicked(){self.load_catalogue();}
                            ui.label(egui::RichText::new(format!("{} mods",self.catalogue.len())).color(muted));
                        });
                    });
                    ui.add_space(12.0);
                    ui.horizontal_wrapped(|ui| { for category in ["All Mods","Core","Utility","Cosmetic","Maps","Gameplay","Your Mods"] { if ui.selectable_label(self.category==category,category).clicked(){self.category=category.to_string();} } });
                    ui.add_space(12.0);
                    if self.catalogue.is_empty(){ui.label(egui::RichText::new("Refresh the catalogue to load available mods.").color(muted));}
                    egui::ScrollArea::vertical().show(ui,|ui|{
                        let query=self.search.to_lowercase();
                        let filtered:Vec<_>=self.catalogue.clone().into_iter().filter(|m| (self.category=="All Mods" || m.category.eq_ignore_ascii_case(&self.category)) && (query.is_empty()||m.name.to_lowercase().contains(&query)||m.description.to_lowercase().contains(&query)||m.category.to_lowercase().contains(&query))).collect();
                        for chunk in filtered.chunks(2){
                            ui.columns(chunk.len(),|cols|{
                                for (col,entry) in cols.iter_mut().zip(chunk){
                                    egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(12).inner_margin(16.0).show(col,|ui|{
                                        ui.set_min_height(160.0);
                                        ui.horizontal(|ui|{
                                            ui.label(egui::RichText::new(entry.name.chars().take(2).collect::<String>().to_uppercase()).size(18.0).strong().color(accent));
                                            ui.vertical(|ui|{
                                                ui.label(egui::RichText::new(&entry.name).strong().size(16.0));
                                                ui.label(egui::RichText::new(format!("{}  ·  {}",entry.category,entry.version)).small().color(muted));
                                            if self.settings.bookmarks.contains(&entry.name){ui.label(egui::RichText::new("★").color(accent));}
                                            });
                                        });
                                        ui.add_space(8.0);
                                        ui.label(egui::RichText::new(&entry.description).color(muted));
                                        ui.add_space(8.0);
                                        ui.horizontal(|ui|{
                                            if ui.small_button(if self.settings.bookmarks.contains(&entry.name){"★ Saved"}else{"☆ Bookmark"}).clicked(){ if self.settings.bookmarks.contains(&entry.name){self.settings.bookmarks.retain(|n|n!=&entry.name);}else{self.settings.bookmarks.push(entry.name.clone());} self.save_settings(); }
                                            ui.label(egui::RichText::new(format!("by {}",entry.author)).small().color(muted));
                                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center),|ui|{
                                                if ui.button("＋ Install").clicked(){self.install_mod(entry);}
                                            });
                                        });
                                    });
                                }
                            });
                            ui.add_space(10.0);
                        }
                    });
                }
                Page::Installed => {
                    ui.heading("Installed mods");
                    ui.label(egui::RichText::new("Your plugins currently installed in Gorilla Tag.").color(muted));
                    ui.add_space(14.0);
                    ui.label(egui::RichText::new(format!("Location  {}",self.mods_dir().display())).small().color(muted));
                    let plugin_files = self.installed_files();
                    if plugin_files.is_empty() {
                        ui.label(egui::RichText::new("No plugin DLLs found. Install a mod from Discover, or check the folder above.").color(muted));
                    }
                    for path in plugin_files {
                        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let is_disabled = file_name.to_ascii_lowercase().ends_with(".dll.disabled");
                        egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(10).inner_margin(12.0).show(ui,|ui|{
                            ui.horizontal(|ui|{
                                ui.label("▣");
                                ui.vertical(|ui|{
                                    ui.label(egui::RichText::new(&file_name).strong());
                                    ui.label(egui::RichText::new(path.parent().unwrap_or(&path).display().to_string()).small().color(muted));
                                });
                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center),|ui|{
                                    let action = if is_disabled { "Enable" } else { "Disable" };
                                    if ui.button(action).clicked() { self.toggle_plugin(&path); }
                                    ui.label(egui::RichText::new(if is_disabled { "OFF" } else { "ON" }).color(if is_disabled { muted } else { accent }));
                                });
                            });
                        });
                    }
                }
                Page::Profiles => {
                    ui.heading("Profiles");
                    ui.label(egui::RichText::new("Separate mod setups for different ways you play.").color(muted));
                    ui.add_space(12.0);
                    ui.horizontal(|ui|{
                        ui.add_sized([260.0,34.0],egui::TextEdit::singleline(&mut self.profile_name).hint_text("New profile name"));
                        if ui.button("＋ Create profile").clicked(){self.create_profile();}
                    });
                    ui.add_space(8.0);
                    let names:Vec<String>=self.settings.profiles.iter().map(|p|p.name.clone()).collect();
                    for name in names{
                        egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(10).inner_margin(12.0).show(ui,|ui|{
                            ui.horizontal(|ui|{
                                if ui.selectable_label(self.settings.selected_profile==name,format!("▤  {}",name)).clicked(){self.settings.selected_profile=name.clone();self.save_settings();}
                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center),|ui|{
                                    if ui.small_button("Apply").clicked(){self.apply_profile(&name);}
                                    if ui.small_button("Delete").clicked(){self.settings.profiles.retain(|p|p.name!=name);if self.settings.selected_profile==name{self.settings.selected_profile.clear();}self.save_settings();}
                                });
                            });
                        });
                    }
                }
                Page::Config => {
                    ui.heading("Config editor");
                    ui.label(egui::RichText::new("Edit configuration text and save it to the selected profile.").color(muted));
                    ui.add_space(12.0);
                    ui.add(egui::TextEdit::multiline(&mut self.config_text).desired_rows(24).code_editor().desired_width(f32::INFINITY));
                    if ui.button("Save config to profile").clicked(){
                        let config_text=self.config_text.clone();
                        let saved=if let Some(p)=self.current_profile_mut(){p.configs.insert("default.cfg".to_string(),config_text);true}else{false};
                        if saved{self.save_settings();self.status="Config saved into profile.".into();}else{self.status="Create/select a profile first.".into();}
                    }
                    if let Some(p)=self.settings.profiles.iter().find(|p|p.name==self.settings.selected_profile){
                        if let Some(saved)=p.configs.get("default.cfg"){if self.config_text.is_empty(){self.config_text=saved.clone();}}
                    }
                }
                Page::Settings => {
                    ui.heading("Settings");
                    ui.label(egui::RichText::new("Configure ModHub and your Gorilla Tag installation.").color(muted));
                    ui.add_space(14.0);
                    egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(12).inner_margin(18.0).show(ui,|ui|{
                        ui.heading("Game location");
                        ui.label(egui::RichText::new("Select the Gorilla Tag install directory.").color(muted));
                        ui.add_sized([ui.available_width(),36.0],egui::TextEdit::singleline(&mut self.settings.game_path).hint_text("Path to Gorilla Tag folder"));
                        ui.horizontal(|ui|{
                            if ui.button("Detect game").clicked(){self.discover_game();}
                            if ui.button("Save location").clicked(){self.save_settings();self.status="Settings saved.".into();}
                        });
                        ui.add_space(8.0);
                        ui.label(egui::RichText::new("Mods are installed to BepInEx/plugins inside this folder.").small().color(muted));
                    });
                    ui.add_space(12.0);
                    egui::Frame::new().fill(panel).stroke(egui::Stroke::new(1.0,line)).corner_radius(12).inner_margin(18.0).show(ui,|ui|{
                        ui.heading("About ModHub");
                        ui.label("Native Rust UI · no Electron or embedded browser");
                        ui.label(egui::RichText::new("Community mod catalogue · Profiles · Configs").color(muted));
                    });
                }
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
    let options=eframe::NativeOptions { viewport:egui::ViewportBuilder::default().with_title("ModHub").with_inner_size([1250.0,800.0]), ..Default::default() };
    eframe::run_native("ModHub",options,Box::new(|_cc|Ok(Box::new(ModHub::new()))))
}
