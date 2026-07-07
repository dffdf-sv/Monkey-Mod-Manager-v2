#region usings
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;
using System.Linq;
using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Controls.Primitives;
using Avalonia.Interactivity;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Platform.Storage;
using DiscordRPC;
using Newtonsoft.Json;
using Button = Avalonia.Controls.Button;
#endregion

namespace MonkeModManager;

public partial class MainWindow : Window
{
    #region Properties
    public List<Mod> Mods { get; } = new();
    private string gamePath;
    private string pluginsPath;
    private readonly HttpClient httpClient = new();
    Theme CurrentTheme;
    private DiscordRpcClient client;
    private List<ModBorderThingyForDictionary> modBorders = new();
    public static MainWindow Instance;
    List<TextBlock> textBlocks = new();
    List<TextBlock> secondaryTextBlocks = new();
    List<TextBlock> GroupTextBlocks = new();
    List<TextBlock> OtherGroupTextBlocks = new();
    private static List<Border> ModControls = new();
    private NotificationManager notificationManager = new();
    private Border badgeBorder;
    private TextBlock badgeText;
    private Popup notificationPopup;
    #endregion
    
    #region Window And Init
    public MainWindow()
    {
        Instance = this;
        DataContext = this;
        InitializeComponent();
        
        this.Opened += async (s, e) =>
        {
            try
            {
                Opacity = 0;
                ShowStartWindow();
                await InitializeAsync();
            }
            catch (Exception ex)
            {
                await ShowErrorMessage($"Initialization failed: {ex.Message}");
            }
        };
    }

    bool ModsDisabled()
    {
        if (File.Exists(Path.Combine(gamePath, "winhttp.dll")))
        {
            DisableEnable.Header = "Disable Mods";
            return false;
        }
        DisableEnable.Header = "Enable Mods";
        return true;
    }

    private async Task InitializeAsync()
    {
        if (!File.Exists(GetConfigPath()))
        {
            var selectedPath = await ShowGamePathDialog();
            if (string.IsNullOrEmpty(selectedPath))
            {
                Close();
                return;
            }
            await SaveConfig(selectedPath, GetTheme());
            await ShowSecurityInfoDialog();
        }
        else
        {
            gamePath = GetGamePath();
            if (string.IsNullOrEmpty(gamePath))
            {
                await ShowErrorMessage("select a game path");
                var selectedPath = await ShowGamePathDialog();
                if (string.IsNullOrEmpty(selectedPath))
                {
                    Close();
                    return;
                }

                await SaveConfig(selectedPath, GetTheme());
            }
        }
        pluginsPath = Path.Combine(gamePath, "BepInEx", "plugins");

        var (updateAvailable, newVersion) = await IsUpdateAvailable(new Version(1, 4, 1));

        if (updateAvailable)
        {
            await NewVersionDialog(newVersion);
        }
        CurrentTheme = GetTheme();
        InitUI();

        InitForRPC();
        await CheckOrInstallBepInEx();
        await LoadModsFromTheNewGitHubRepoAsync();
        MakeNotificationThing();
        SendNeededMesages();
        MenuImage.Source = new Bitmap(AssetLoader.Open(new Uri("avares://MonkeModManager/Assets/menu-google.png")));
    }

    private async Task ShowSecurityInfoDialog()
    {
        var dialog = new Window
        {
            Title = "Security Information",
            Width = 500,
            Height = 350,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            CanResize = false,
            Background = getBGForTheme()
        };

        var content = new StackPanel
        {
            Margin = new Thickness(24),
            Spacing = 16
        };

        content.Children.Add(new TextBlock
        {
            Text = "Regarding Antivirus Detection",
            FontSize = 18,
            FontWeight = FontWeight.Bold,
            Foreground = getTextTheme()
        });

        content.Children.Add(new TextBlock
        {
            Text = "This mod manager downloads and installs files from GitHub repositories." +
                   " Some antivirus software may flag this as suspicious because:\n\n" +
                   "  - It downloads files from the internet\n" +
                   "  - It writes DLL files to your game folder\n" +
                   "  - It's an unsigned application\n\n" +
                   "This is a false positive. All mods are downloaded from trusted GitHub sources." +
                   " The application is open source and auditable.",
            TextWrapping = TextWrapping.Wrap,
            FontSize = 13,
            Foreground = getTextTheme()
        });

        content.Children.Add(new TextBlock
        {
            Text = "To resolve this, add an exception for this app in your antivirus software.",
            TextWrapping = TextWrapping.Wrap,
            FontSize = 12,
            FontStyle = FontStyle.Italic,
            Foreground = GetSecondaryBrush()
        });

        var okButton = new Button
        {
            Content = "I Understand",
            HorizontalAlignment = HorizontalAlignment.Center,
            Padding = new Thickness(24, 10),
            CornerRadius = new CornerRadius(8),
            Background = GetSuccessBrush(),
            Foreground = Brushes.White
        };

        okButton.Click += (s, e) => dialog.Close();
        content.Children.Add(okButton);

        dialog.Content = content;
        await dialog.ShowDialog(this);
    }

    void SendNeededMesages()
    {
        if (ModsDisabled())
        {
            notificationManager.ShowNotification("Mods Disabled!", "The mods will not function!");
        }
    }
    void InitUI()
    {
        TitleText.Foreground = getTextTheme();
        MessageBox0.Foreground = getTextTheme();
        MainGrid.Background = getBGForTheme();
        ModsThingy.Background = Brushes.Transparent;
        MsgBox0Border.Background = GetCardBGS();
        MsgBox0Border.BorderBrush = GetBorderBrush();
        SearchBox.Foreground = getTextTheme();
        SearchBox.Background = GetCardBGS();
        SortBox.Foreground = getTextTheme();
        SortBox.Background = GetCardBGS();

        // Header bar theming
        if (HeaderBar != null)
        {
            HeaderBar.Background = GetCardBGS();
            HeaderBar.BorderBrush = GetBorderBrush();
        }
        if (SearchBar != null)
        {
            SearchBar.Background = getBGForTheme();
        }
    }


    private Window window;

    private void ShowStartWindow()
    {
        var stackPanel = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };

        var img = new Image
        {
            Width = 150,
            Height = 150,
            Source = new Bitmap(AssetLoader.Open(new Uri("avares://MonkeModManager/Assets/mmm-ico.png"))),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };

        stackPanel.Children.Add(img);

        window = new Window
        {
            Content = stackPanel,
            Width = 300,
            Height = 350,
            WindowStartupLocation = WindowStartupLocation.CenterScreen,
            CanResize = false,
            ShowInTaskbar = false,
            Background = getBGForTheme(),
            SystemDecorations = SystemDecorations.None,
            SizeToContent = SizeToContent.Manual
        };
        window.Show();
    }

    void closeStartWindow()
    {
        window.Close();
    }
    
    public IBrush getBGForTheme()
    {
        return GetTheme() switch
        {
            MonkeModManager.Theme.Light => Brush.Parse("#FFFFFF"),
            MonkeModManager.Theme.Dark => Brush.Parse("#121212"),
            MonkeModManager.Theme.DarkHighContrast => Brush.Parse("#000000"),
            MonkeModManager.Theme.Sunrise => Brush.Parse("#F5E0C3"),
            MonkeModManager.Theme.Frost => Brush.Parse("#D0E1F9"),
            _ => Brush.Parse("#FFFFFF")
        };
    }

    public IBrush GetBorderBrush()
    {
        return GetTheme() switch
        {
            MonkeModManager.Theme.Light => Brush.Parse("#E0E0E0"),
            MonkeModManager.Theme.Dark => Brush.Parse("#2C2C2C"),
            MonkeModManager.Theme.DarkHighContrast => Brush.Parse("#FFFFFF"),
            MonkeModManager.Theme.Sunrise => Brush.Parse("#D7CCC8"),
            MonkeModManager.Theme.Frost => Brush.Parse("#90A4AE"),
            _ => Brushes.Black
        };
    }

    public IBrush GetCardBGS()
    {
        return GetTheme() switch
        {
            MonkeModManager.Theme.Light => Brush.Parse("#F9F9F9"),
            MonkeModManager.Theme.Dark => Brush.Parse("#1F1F1F"),
            MonkeModManager.Theme.DarkHighContrast => Brush.Parse("#000000"),
            MonkeModManager.Theme.Sunrise => Brush.Parse("#FFE0B2"),
            MonkeModManager.Theme.Frost => Brush.Parse("#BBDEFB"),
            _ => Brush.Parse("#FFFFFF")
        };
    }

    public IBrush getTextTheme()
    {
        return GetTheme() switch
        {
            MonkeModManager.Theme.Light => Brush.Parse("#212121"),
            MonkeModManager.Theme.Dark => Brush.Parse("#E0E0E0"),
            MonkeModManager.Theme.DarkHighContrast => Brush.Parse("#FFFFFF"),
            MonkeModManager.Theme.Sunrise => Brush.Parse("#6D4C41"),
            MonkeModManager.Theme.Frost => Brush.Parse("#0D47A1"),
            _ => Brush.Parse("#FFFFFF")
        };
    }

    public IBrush GetGroupText()
    {
        return GetTheme() switch
        {
            MonkeModManager.Theme.DarkHighContrast => Brush.Parse("#000000"),
            _ => Brush.Parse("#FFFFFF")
        };
    }

    public IBrush GetSecondaryText()
    {
        return GetTheme() switch
        {
            MonkeModManager.Theme.Light => Brush.Parse("#666666"),
            MonkeModManager.Theme.Dark => Brush.Parse("#B0B0B0"),
            MonkeModManager.Theme.DarkHighContrast => Brush.Parse("#FFFFFF"),
            MonkeModManager.Theme.Sunrise => Brush.Parse("#6D4C41"),
            MonkeModManager.Theme.Frost => Brush.Parse("#546E7A"),
            _ => Brush.Parse("#FFFFFF")
        };
    }
    void InitForRPC()
    {
        client = new DiscordRpcClient("1389965977705513010");

        client.OnReady += (sender, e) =>
        {
            Console.WriteLine($"[DiscordRPC] - Connected to Discord as {e.User.Username}");
            client.SetPresence(new RichPresence
            {
                Buttons = new[]
                {
                    new DiscordRPC.Button
                    {
                        Label = "Install Mods too",
                        Url = "https://github.com/arielthemonke/MonkeModManager/releases/latest"
                    },
                },
                Details = "Modding",
                State = "Installing Mods",
                Assets = new Assets
                {
                    LargeImageKey = "mmm_ico",
                }
            });
            Console.WriteLine($"[DiscordRPC] - RPC Set");
        };

        client.OnError += (sender, e) =>
        {
            Console.WriteLine($"[ERROR][DiscordRPC] - {e.Message}");
        };
        
        client.OnConnectionFailed += (sender, e) =>
        {
            Console.WriteLine($"[ERROR][DiscordRPC] - Connection failed: {e}");
        };

        client.OnConnectionEstablished += (sender, e) =>
        {
            Console.WriteLine("[DiscordRPC] - RPC Connection established");
        };

        client.Initialize();
    }

    public static async Task<(bool UpdateAvailable, Version LatestVersion)> IsUpdateAvailable(Version currentVersion)
    {
        try
        {
            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("User-Agent", "ModManager");

            string url = "https://raw.githubusercontent.com/arielthemonke/MonkeModManager/main/version";
            string response = await client.GetStringAsync(url);
            var latestVersion = Version.Parse(response);

            return (currentVersion < latestVersion, latestVersion);
        }
        catch
        {
            return (false, currentVersion);
        }
    }
    #endregion
    
    #region Configs And Stuff
    private static string GetConfigPath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var folder = Path.Combine(appData, "MonkeModManager");
        Directory.CreateDirectory(folder);
        return Path.Combine(folder, "config.json");
    }

    public static Theme GetTheme()
    {
        try
        {
            var configPath = GetConfigPath();
            if (!File.Exists(configPath))
            {
                var defaultConfig = new Config { Theme = MonkeModManager.Theme.Light };
                File.WriteAllText(configPath, JsonConvert.SerializeObject(defaultConfig, Formatting.Indented));
                return defaultConfig.Theme;
            }

            var json = File.ReadAllText(configPath);
            var config = JsonConvert.DeserializeObject<Config>(json);

            if (config?.Theme != null)
            {
                return config.Theme;
            }
            else
            {
                return MonkeModManager.Theme.Light;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading theme: {ex}");
            return MonkeModManager.Theme.Light;
        }
    }
    #endregion

    #region Mod Loading
    private readonly HashSet<string> BlacklistedMods = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "BepInEx"
        // made it like this because i might add more later but idk
    };

    public async Task LoadModsFromTheNewGitHubRepoAsync()
    {
        using var client = new HttpClient();
        client.DefaultRequestHeaders.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue
        {
            NoCache = true
        };

        string url = "https://raw.githubusercontent.com/dffdf-sv/GORILA-TAG-MODBASE/main/modinfo.Json" + "?t=" + DateTime.Now.Ticks;


        try
        {
            var json = await client.GetStringAsync(url);
            var mods = Newtonsoft.Json.JsonConvert.DeserializeObject<System.Collections.Generic.List<Mod>>(json);

            if (mods != null)
            {
                int loadedCount = 0;
                int blacklistedCount = 0;

                var filtered = mods
                    .Where(m => !BlacklistedMods.Contains(m.Name, StringComparer.OrdinalIgnoreCase))
                    .ToList();



                blacklistedCount = mods.Count - filtered.Count;

                var grouped = filtered
                    .GroupBy(m => string.IsNullOrWhiteSpace(m.Group) ? "Uncategorized" : m.Group)
                    .OrderBy(g => g.Key);

                foreach (var group in grouped)
                {
                    AddHeader($"-- {group.Key} --");
                    foreach (var mod in group.OrderBy(m => m.Name))
                    {
                        Mods.Add(mod);
                        var modControl = MakeModControl(mod);
                        ItemControl0.Items.Add(modControl);
                        loadedCount++;
                    }
                }

                Console.WriteLine($"loaded {loadedCount} mods, skipped {blacklistedCount} blacklisted mods");
                // even counting!! not that anyone will read this but yeah
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Loading mods failed: {ex.Message}");
            await ShowErrorMessage("Couldn't load the mod list from GitHub.");
        }
        closeStartWindow();
        Opacity = 1;
    }
    
    private void SearchBox_OnTextChanged(object? sender, TextChangedEventArgs e)
    {
        ApplyFilter(SearchBox.Text ?? "");
    }
    private void ApplyFilter(string query)
    {
        query = query.Trim().ToLowerInvariant();

        ItemControl0.Items.Clear();

        var filtered = string.IsNullOrWhiteSpace(query)
            ? Mods.ToList()
            : Mods.Where(m =>
                    m.Name?.ToLowerInvariant().Contains(query) == true ||
                    m.Author?.ToLowerInvariant().Contains(query) == true ||
                    m.Group?.ToLowerInvariant().Contains(query) == true)
                .ToList();

        switch (SortBox.SelectedIndex)
        {
            case 0:
                var grouped = filtered
                    .GroupBy(m => string.IsNullOrWhiteSpace(m.Group) ? "Uncategorized" : m.Group)
                    .OrderBy(g => g.Key);
                foreach (var group in grouped)
                {
                    AddHeader($"-- {group.Key} --");
                    foreach (var mod in group.OrderBy(m => m.Name))
                        ItemControl0.Items.Add(MakeModControl(mod));
                }
                break;
            case 1:
                var groupedByLetter = filtered
                    .GroupBy(m => string.IsNullOrWhiteSpace(m.Name) ? "#" : m.Name[0].ToString().ToUpperInvariant())
                    .OrderBy(g => g.Key);
                foreach (var group in groupedByLetter)
                {
                    AddHeader($"-- {group.Key} --");
                    foreach (var mod in group.OrderBy(m => m.Name))
                        ItemControl0.Items.Add(MakeModControl(mod));
                }
                break;

            case 2:
                var groupedByAuthor = filtered
                    .GroupBy(m => string.IsNullOrWhiteSpace(m.Author) ? "Unknown Author" : m.Author)
                    .OrderBy(g => g.Key);
                foreach (var group in groupedByAuthor)
                {
                    AddHeader($"-- {group.Key} --");
                    foreach (var mod in group.OrderBy(m => m.Name))
                        ItemControl0.Items.Add(MakeModControl(mod));
                }
                break;

            case 3:
                foreach (var mod in filtered.OrderByDescending(m => m.Version))
                    ItemControl0.Items.Add(MakeModControl(mod));
                break;
        }
    }
    private void AddHeader(string text)
    {
        var container = new Border
        {
            Margin = new Thickness(0, 16, 0, 8),
            Padding = new Thickness(0, 4)
        };

        var textBlock = new TextBlock
        {
            Text = text.Replace("-- ", "").Replace(" --", ""),
            Foreground = getTextTheme(),
            FontWeight = FontWeight.SemiBold,
            FontSize = 14
        };
        container.Child = textBlock;
        ItemControl0.Items.Add(container);
        OtherGroupTextBlocks.Add(textBlock);
    }
    
    private void SortBox_OnSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (Mods == null || ItemControl0 == null)
            return;

        ApplyFilter(SearchBox?.Text ?? "");
    }
    
    public async Task fixBepInExConfig()
    {
        string url = "https://raw.githubusercontent.com/dffdf-sv/GORILA-TAG-MODBASE/refs/heads/main/BepInEx.cfg";
        string configPath = Path.Combine(gamePath, "BepInEx", "config", "BepInEx.cfg");

        try
        {
            using var client = new HttpClient();
            var configContent = await client.GetStringAsync(url);
            Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
            await File.WriteAllTextAsync(configPath, configContent);

            Console.WriteLine("yay i did a thing!");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"never mind, it didnt work :sob: {ex.Message}");
            await ShowErrorMessage("it didnt work. error code: 50000000");
        }
    }

    async Task FixUEConfig()
    {
        string url =
            "https://raw.githubusercontent.com/arielthemonke/ModInfo/refs/heads/main/com.sinai.unityexplorer.cfg";
        string configPath = Path.Combine(gamePath, "BepInEx", "config", "com.sinai.unityexplorer.cfg");

        try
        {
            using var client = new HttpClient();
            var configContent = await client.GetStringAsync(url);
            Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
            await File.WriteAllTextAsync(configPath, configContent);

            Console.WriteLine("yay i did a thing! x2");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"never mind, it didnt work :sob: {ex.Message}");
            await ShowErrorMessage("it didnt work. error code: 50000001");
        }
    }
    #endregion

    #region UI And Stuff
    private async Task SaveConfig(string path, Theme theme)
    {
        gamePath = path;
        CurrentTheme = theme;
        var config = new Config { GamePath = path, Theme = theme};
        var json = JsonConvert.SerializeObject(config, Formatting.Indented);
        await File.WriteAllTextAsync(GetConfigPath(), json);
        MessageBox0.Text = "Game path saved successfully!";
    }
    
    private void ShowDropdown_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.ContextMenu != null)
        {
            button.ContextMenu.Open(button);
        }
    }

    void SwitchTheme(object sender, RoutedEventArgs e)
    {
        var currentTheme = GetTheme();
        var themes = Enum.GetValues<Theme>();
        var currentIndex = Array.IndexOf(themes, currentTheme);
        var nextIndex = (currentIndex + 1) % themes.Length;

        CurrentTheme = themes[nextIndex];

        var config = new Config { GamePath = GetGamePath(), Theme = CurrentTheme };
        var json = JsonConvert.SerializeObject(config);
        File.WriteAllText(GetConfigPath(), json);

        InitUI();
        foreach (var border in modBorders)
        {
            border.border.Background = GetCardBGS();
            border.border.BorderBrush = GetBorderBrush();
            border.border.BoxShadow = new BoxShadows(new BoxShadow
            {
                OffsetX = 0,
                OffsetY = 2,
                Blur = 8,
                Spread = 0,
                Color = Color.Parse("#20000000")
            });
        }

        if (textBlocks.Any())
        {
            foreach (var textBlock in textBlocks)
            {
                textBlock.Foreground = getTextTheme();
            }
        }

        if (secondaryTextBlocks.Any())
        {
            foreach (var textBlock in secondaryTextBlocks)
            {
                textBlock.Foreground = GetSecondaryBrush();
            }
        }

        if (GroupTextBlocks.Any())
        {
            foreach (var textBlock in GroupTextBlocks)
            {
                textBlock.Foreground = Brushes.White;
            }
        }

        if (OtherGroupTextBlocks.Any())
        {
            foreach (var textBlock in OtherGroupTextBlocks)
            {
                textBlock.Foreground = getTextTheme();
            }
        }
    }
    
    string GetRepoUrl(string fullUrl)
    {
        if (string.IsNullOrEmpty(fullUrl))
            return fullUrl;
        try
        {
            var uri = new Uri(fullUrl);
            var segments = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries);

            if (segments.Length >= 2)
            {
                var owner = segments[0];
                var repo = segments[1];
                return $"{uri.Scheme}://{uri.Host}/{owner}/{repo}";
            }
        }
        catch
        {
        }

        return fullUrl;
    }

    private Border MakeModControl(Mod mod)
    {
        var isInstalled = IsModInstalled(mod);

        var border = new Border
        {
            Tag = mod.Name,
            BorderThickness = new Thickness(1),
            BorderBrush = GetBorderBrush(),
            CornerRadius = new CornerRadius(12),
            Padding = new Thickness(16),
            Background = GetCardBGS(),
            ClipToBounds = true
        };

        // Drop shadow effect
        border.BoxShadow = new BoxShadows(new BoxShadow
        {
            OffsetX = 0,
            OffsetY = 2,
            Blur = 8,
            Spread = 0,
            Color = Color.Parse("#20000000")
        });

        var mainGrid = new Grid();
        mainGrid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Star));
        mainGrid.ColumnDefinitions.Add(new ColumnDefinition(GridLength.Auto));

        var contentStack = new StackPanel
        {
            Spacing = 8
        };

        // Top row: Name and status badge
        var topRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 10
        };

        var nameTextBlock = new TextBlock
        {
            Text = mod.Name,
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            VerticalAlignment = VerticalAlignment.Center
        };
        topRow.Children.Add(nameTextBlock);

        // Version badge
        var versionBadge = new Border
        {
            Background = GetVersionBadgeColor(mod.Version),
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(6, 2),
            VerticalAlignment = VerticalAlignment.Center
        };
        var versionText = new TextBlock
        {
            Text = $"v{mod.Version}",
            FontSize = 11,
            FontWeight = FontWeight.Medium,
            Foreground = Brushes.White
        };
        versionBadge.Child = versionText;
        topRow.Children.Add(versionBadge);

        // Status badge
        var statusBadge = new Border
        {
            Background = isInstalled ? GetSuccessBrush() : GetNeutralBrush(),
            CornerRadius = new CornerRadius(4),
            Padding = new Thickness(8, 3),
            VerticalAlignment = VerticalAlignment.Center
        };
        var statusText = new TextBlock
        {
            Name = "status",
            Text = isInstalled ? "Installed" : "Not installed",
            FontSize = 11,
            FontWeight = FontWeight.Medium,
            Foreground = isInstalled ? Brushes.White : GetSecondaryBrush()
        };
        statusBadge.Child = statusText;
        topRow.Children.Add(statusBadge);
        contentStack.Children.Add(topRow);

        // Author and group badges row
        var badgesRow = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };

        if (!string.IsNullOrEmpty(mod.Author))
        {
            var authorBadge = new Border
            {
                Background = GetMutedBrush(),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(6, 2)
            };
            var authorTextBlock = new TextBlock
            {
                Text = $"by {mod.Author}",
                FontSize = 11,
                Foreground = GetSecondaryBrush()
            };
            authorBadge.Child = authorTextBlock;
            badgesRow.Children.Add(authorBadge);
            secondaryTextBlocks.Add(authorTextBlock);
        }

        if (!string.IsNullOrEmpty(mod.Group))
        {
            var groupBadge = new Border
            {
                Background = GetGroupColor(mod.Group),
                CornerRadius = new CornerRadius(4),
                Padding = new Thickness(6, 2)
            };
            var groupText = new TextBlock
            {
                Text = mod.Group,
                FontSize = 11,
                FontWeight = FontWeight.Medium,
                Foreground = Brushes.White
            };
            groupBadge.Child = groupText;
            badgesRow.Children.Add(groupBadge);
            GroupTextBlocks.Add(groupText);
        }
        contentStack.Children.Add(badgesRow);

        // Dependencies
        if (mod.Dependencies?.Any() == true)
        {
            var depsPanel = new StackPanel
            {
                Orientation = Orientation.Horizontal,
                Spacing = 6
            };
            var depsLabel = new TextBlock
            {
                Text = "Requires:",
                FontSize = 11,
                Foreground = GetSecondaryBrush()
            };
            depsPanel.Children.Add(depsLabel);
            var depsText = new TextBlock
            {
                Text = string.Join(", ", mod.Dependencies),
                FontSize = 11,
                Foreground = getTextTheme()
            };
            depsPanel.Children.Add(depsText);
            contentStack.Children.Add(depsPanel);
            secondaryTextBlocks.Add(depsLabel);
            textBlocks.Add(depsText);
        }

        // GitHub link
        var githubLink = new TextBlock
        {
            Text = "View on GitHub",
            FontSize = 12,
            Foreground = GetAccentBrush(),
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.CursorType.Hand)
        };
        githubLink.PointerPressed += (s, e) =>
        {
            var repoUrl = GetRepoUrl(mod.DownloadUrl);
            if (!string.IsNullOrEmpty(repoUrl))
            {
                Process.Start(new ProcessStartInfo(repoUrl) { UseShellExecute = true });
            }
        };
        contentStack.Children.Add(githubLink);
        secondaryTextBlocks.Add(githubLink);

        // Action buttons
        var buttonStack = new StackPanel
        {
            Spacing = 6,
            VerticalAlignment = VerticalAlignment.Center
        };

        var installButton = new Button
        {
            Name = "InstallButton",
            Content = isInstalled ? "Reinstall" : "Install",
            Background = isInstalled ? GetWarningBrush() : GetSuccessBrush(),
            Foreground = Brushes.White,
            Padding = new Thickness(20, 10),
            CornerRadius = new CornerRadius(8),
            FontWeight = FontWeight.Medium,
            Cursor = new Avalonia.Input.Cursor(Avalonia.Input.CursorType.Hand)
        };

        installButton.Click += async (s, e) =>
        {
            await InstallMod(mod, installButton, statusText, statusBadge);
        };

        Button uninstallButton = null;
        if (isInstalled)
        {
            uninstallButton = new Button
            {
                Content = "Uninstall",
                Background = GetDangerBrush(),
                Foreground = Brushes.White,
                Padding = new Thickness(20, 10),
                CornerRadius = new CornerRadius(8),
                FontWeight = FontWeight.Medium,
                Cursor = new Avalonia.Input.Cursor(Avalonia.Input.CursorType.Hand)
            };

            uninstallButton.Click += async (s, e) =>
            {
                await UninstallMod(mod, installButton, uninstallButton, statusText, statusBadge);
            };

            buttonStack.Children.Add(uninstallButton);
        }

        buttonStack.Children.Add(installButton);

        Grid.SetColumn(contentStack, 0);
        Grid.SetColumn(buttonStack, 1);

        mainGrid.Children.Add(contentStack);
        mainGrid.Children.Add(buttonStack);

        border.Child = mainGrid;

        var thisBorder = new ModBorderThingyForDictionary
        {
            border = border,
            InstallButton = installButton,
            StatusText = statusText,
            StatusBadge = statusBadge,
            UninstallButton = uninstallButton,
            ModAssigned = mod,
        };

        modBorders.Add(thisBorder);
        nameTextBlock.Foreground = getTextTheme();
        textBlocks.Add(nameTextBlock);
        ModControls.Add(border);
        return border;
    }

    private IBrush GetVersionBadgeColor(string version)
    {
        return CurrentTheme switch
        {
            Theme.Dark or Theme.DarkHighContrast => Brush.Parse("#3D5AFE"),
            _ => Brush.Parse("#3949AB")
        };
    }

    private IBrush GetSuccessBrush() => Brush.Parse("#4CAF50");
    private IBrush GetWarningBrush() => Brush.Parse("#FF9800");
    private IBrush GetDangerBrush() => Brush.Parse("#F44336");
    private IBrush GetNeutralBrush() => CurrentTheme switch
    {
        Theme.Dark or Theme.DarkHighContrast => Brush.Parse("#424242"),
        _ => Brush.Parse("#E0E0E0")
    };
    private IBrush GetSecondaryBrush() => CurrentTheme switch
    {
        Theme.Dark or Theme.DarkHighContrast => Brush.Parse("#9E9E9E"),
        _ => Brush.Parse("#757575")
    };
    private IBrush GetMutedBrush() => CurrentTheme switch
    {
        Theme.Dark or Theme.DarkHighContrast => Brush.Parse("#333333"),
        _ => Brush.Parse("#F5F5F5")
    };
    private IBrush GetAccentBrush() => CurrentTheme switch
    {
        Theme.Dark or Theme.DarkHighContrast => Brush.Parse("#64B5F6"),
        _ => Brush.Parse("#1976D2")
    };

    void MakeNotificationThing()
    {
        var bellStack = new StackPanel
        {
            Orientation = Orientation.Vertical,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(10)
        };
        var bellButton = new Button
        {
            Background = Brushes.Transparent,
            BorderBrush = null,
            Content = new Image
            {
                Source = new Bitmap(AssetLoader.Open(new Uri("avares://MonkeModManager/Assets/doorbell-google.png"))),
                Width = 28,
                Height = 28,
                Stretch = Stretch.Uniform
            }
        };

        bellButton.Click += BellButton_Click;
        badgeBorder = new Border
        {
            Background = Brushes.Red,
            CornerRadius = new CornerRadius(10),
            Width = 20,
            Height = 20,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Child = (badgeText = new TextBlock
            {
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                FontSize = 12,
                Text = "0"
            }),
            IsVisible = false
        };
        bellStack.Children.Add(bellButton);
        bellStack.Children.Add(badgeBorder);

        MainGrid.Children.Add(bellStack);
        notificationPopup = new Popup
        {
            Placement = PlacementMode.Bottom,
            PlacementTarget = bellButton,
            Child = new Border
            {
                Background = Brushes.White,
                CornerRadius = new CornerRadius(5),
                Width = 250,
                Padding = new Thickness(10),
                Child = BuildNotificationList()
            }
        };

        MainGrid.Children.Add(notificationPopup);
        notificationManager.OnChanged += UpdateUI;
    }
    
    private void BellButton_Click(object? sender, Avalonia.Interactivity.RoutedEventArgs e)
    {
        if (notificationManager.Notifications.Count > 0)
        {
            notificationPopup.IsOpen = !notificationPopup.IsOpen;

            if (notificationPopup.IsOpen)
                notificationManager.MarkAllAsRead();
        }
    }

    private StackPanel BuildNotificationList()
    {
        var stack = new StackPanel();

        foreach (var notif in notificationManager.Notifications)
        {
            var notifPanel = new StackPanel { Margin = new Thickness(5) };

            var title = new TextBlock
            {
                Text = notif.Title,
                FontWeight = FontWeight.Bold
            };
            var message = new TextBlock
            {
                Text = notif.Message,
                FontSize = 12
            };
            notifPanel.Children.Add(message);
            notifPanel.Children.Add(title);
            stack.Children.Add(notifPanel);
        }
        return stack;
    }

    private void UpdateUI()
    {
        int unread = notificationManager.UnreadCount;

        badgeText.Text = unread.ToString();
        badgeBorder.IsVisible = unread > 0;
        if (notificationPopup.Child is Border border && border.Child is StackPanel stack)
        {
            stack.Children.Clear();
            foreach (var notif in notificationManager.Notifications)
            {
                var notifPanel = new StackPanel { Margin = new Thickness(5) };

                notifPanel.Children.Add(new TextBlock
                {
                    Text = notif.Title,
                    FontWeight = FontWeight.Bold
                });

                notifPanel.Children.Add(new TextBlock
                {
                    Text = notif.Message,
                    FontSize = 12
                });

                stack.Children.Add(notifPanel);
            }
        }
    }

    private IBrush GetGroupColor(string group)
    {
        switch (CurrentTheme)
        {
            case MonkeModManager.Theme.DarkHighContrast:
                return group?.ToLower() switch
                {
                    _ => Brush.Parse("#FFFFFF")
                };
            default:
                return group?.ToLower() switch
                {
                    "core" => Brushes.DarkBlue,
                    "libraries" => Brushes.Purple,
                    "gameplay" => Brushes.Green,
                    "cosmetic" => Brushes.Pink,
                    "utility" => Brushes.Orange,
                    _ => Brushes.LightGray
                    // im colour blind so hope I didnt do stupid things
                };
        }
    }
    private string ShortenUrl(string url)
    {
        if (string.IsNullOrEmpty(url) || url.Length <= 50)
            return url;
        
        return url.Substring(0, 47) + "...";
    }

    private bool IsModInstalled(Mod mod)
    {
        if (string.IsNullOrEmpty(pluginsPath) || !Directory.Exists(pluginsPath))
            return false;
            
        var downloadUrl = mod.DownloadUrl;
        if (string.IsNullOrEmpty(downloadUrl))
            return false;
            
        try
        {
            var uri = new Uri(downloadUrl);
            var fileName = Path.GetFileName(uri.LocalPath);
            
            if (string.IsNullOrEmpty(fileName))
                return false;

            var installLocation = !string.IsNullOrEmpty(mod.InstallLocation) 
                ? mod.InstallLocation 
                : "BepInEx/plugins";
            var targetDirectory = Path.Combine(gamePath, installLocation);

            if (fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                var trackingFile = Path.Combine(appData, "MonkeModManager", $".{mod.Name}_installed.txt");
                return File.Exists(trackingFile);
            }
            else
            {
                var targetPath = Path.Combine(targetDirectory, fileName);
                if (File.Exists(targetPath))
                    return true;
                var files = Directory.GetFiles(targetDirectory, fileName, SearchOption.AllDirectories);
                return files.Length > 0;
            }
        }
        catch (Exception ex)
        {
            return false;
        }
    }
#endregion

    #region Installation
    private void ExtractZipToFolder(string zipPath, string targetDirectory)
    {
        using var archive = ZipFile.OpenRead(zipPath);
        
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name))
                continue;

            var entryPath = entry.FullName.Replace('\\', '/');
            if (entryPath.Contains("../") || Path.IsPathRooted(entryPath))
                continue;

            var destinationPath = Path.Combine(targetDirectory, entry.FullName);
            
            var fullDestinationPath = Path.GetFullPath(destinationPath);
            var fullTargetPath = Path.GetFullPath(targetDirectory);
            
            if (!fullDestinationPath.StartsWith(fullTargetPath, StringComparison.OrdinalIgnoreCase))
                continue;

            var directory = Path.GetDirectoryName(destinationPath);
            
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            entry.ExtractToFile(destinationPath, overwrite: true);
        }
    }

    private async Task InstallMod(Mod mod, Button installButton, TextBlock statusText, Border statusBadge, Mod ModSender = null)
    {
        if (mod == null)
            throw new ArgumentNullException(nameof(mod));

        try
        {
            if (installButton != null)
            {
                installButton.IsEnabled = false;
                installButton.Content = "Installing...";
            }
            MessageBox0.Text = $"Installing {mod.Name}...";

            var installLocation = !string.IsNullOrEmpty(mod.InstallLocation)
                ? mod.InstallLocation
                : "BepInEx/plugins";

            var targetDirectory = Path.Combine(gamePath, installLocation);
            if (!Directory.Exists(targetDirectory))
            {
                Directory.CreateDirectory(targetDirectory);
            }

            var downloadUrl = mod.DownloadUrl;
            if (string.IsNullOrEmpty(downloadUrl))
            {
                throw new InvalidOperationException("Mod download URL is empty");
            }

            // Verify the URL is from a trusted source (GitHub)
            if (!IsTrustedDownloadSource(downloadUrl))
            {
                throw new InvalidOperationException("Download URL is not from a trusted source (GitHub). Aborting for security.");
            }

            var uri = new Uri(downloadUrl);
            var fileName = Path.GetFileName(uri.LocalPath);

            if (string.IsNullOrEmpty(fileName))
            {
                fileName = $"{mod.Name}.dll";
            }

            var downloadPath = await DownloadFile(downloadUrl, fileName);

            if (fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                var installedFiles = new List<string>();

                using (var archive = ZipFile.OpenRead(downloadPath))
                {
                    foreach (var entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name))
                            continue;
                        var entryPath = entry.FullName.Replace('\\', '/');
                        if (entryPath.Contains("../") || Path.IsPathRooted(entryPath))
                            continue;

                        var destinationPath = Path.Combine(targetDirectory, entry.FullName);
                        var fullDestinationPath = Path.GetFullPath(destinationPath);
                        var fullTargetPath = Path.GetFullPath(targetDirectory);

                        if (!fullDestinationPath.StartsWith(fullTargetPath, StringComparison.OrdinalIgnoreCase))
                            continue;

                        var directory = Path.GetDirectoryName(destinationPath);

                        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                        {
                            Directory.CreateDirectory(directory);
                        }

                        entry.ExtractToFile(destinationPath, overwrite: true);
                        var relativePath = Path.GetRelativePath(targetDirectory, destinationPath);
                        installedFiles.Add(relativePath);
                    }
                }

                var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                var trackingFile = Path.Combine(appData, "MonkeModManager", $".{mod.Name}_installed.txt");
                await File.WriteAllLinesAsync(trackingFile, installedFiles);

                if (File.Exists(downloadPath))
                {
                    File.Delete(downloadPath);
                }
            }
            else
            {
                var modFolder = Path.Combine(targetDirectory, mod.Name);
                if (!Directory.Exists(modFolder))
                {
                    Directory.CreateDirectory(modFolder);
                }

                var targetPath = Path.Combine(modFolder, fileName);

                if (File.Exists(targetPath))
                {
                    File.Delete(targetPath);
                }

                File.Move(downloadPath, targetPath);
            }

            statusText.Text = "Installed";
            statusBadge.Background = GetSuccessBrush();
            statusText.Foreground = Brushes.White;
            installButton.Content = "Reinstall";
            installButton.Background = GetWarningBrush();

            MessageBox0.Text = $"Successfully installed {mod.Name} v{mod.Version}!";
        }
        catch (Exception ex)
        {
            await ShowErrorMessage($"Failed to install {mod.Name}: {ex.Message}");

            statusText.Text = "Failed";
            statusBadge.Background = GetDangerBrush();
            statusText.Foreground = Brushes.White;
            installButton.Content = "Install";
            installButton.Background = GetSuccessBrush();
        }
        finally
        {
            installButton.IsEnabled = true;
        }
        if (mod.Dependencies.Any())
        {
            foreach (var dependency in mod.Dependencies)
            {
                foreach (var modBorder in modBorders)
                {
                    if (modBorder.ModAssigned != ModSender)
                    {
                        if (modBorder.ModAssigned.ModName == dependency)
                        {
                            await InstallMod(modBorder.ModAssigned, modBorder.InstallButton, modBorder.StatusText, modBorder.StatusBadge, mod);
                        }
                    }
                }
            }
        }
    }

    private bool IsTrustedDownloadSource(string url)
    {
        try
        {
            var uri = new Uri(url);
            // Only allow downloads from GitHub
            return uri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase) ||
                   uri.Host.Equals("raw.githubusercontent.com", StringComparison.OrdinalIgnoreCase) ||
                   uri.Host.EndsWith(".github.io", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private async Task UninstallMod(Mod mod, Button installButton, Button uninstallButton, TextBlock statusText, Border statusBadge)
    {
        if (mod == null)
            throw new ArgumentNullException(nameof(mod));

        try
        {
            var installLocation = !string.IsNullOrEmpty(mod.InstallLocation)
                ? mod.InstallLocation
                : "BepInEx/plugins";

            var targetDirectory = Path.Combine(gamePath, installLocation);
            var fileDeleted = false;

            var downloadUrl = mod.DownloadUrl;
            if (string.IsNullOrEmpty(downloadUrl))
            {
                MessageBox0.Text = $"Cannot uninstall {mod.Name}: No download URL available.";
                return;
            }

            var uri = new Uri(downloadUrl);
            var fileName = Path.GetFileName(uri.LocalPath);

            if (string.IsNullOrEmpty(fileName))
            {
                MessageBox0.Text = $"Cannot uninstall {mod.Name}: Cannot determine filename from URL.";
                return;
            }

            if (Directory.Exists(targetDirectory))
            {
                if (fileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                {
                    var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                    var trackingFile = Path.Combine(appData, "MonkeModManager", $".{mod.Name}_installed.txt");

                    if (File.Exists(trackingFile))
                    {
                        var installedFiles = await File.ReadAllLinesAsync(trackingFile);

                        foreach (var relativePath in installedFiles)
                        {
                            var fullPath = Path.Combine(targetDirectory, relativePath);
                            if (File.Exists(fullPath))
                            {
                                try
                                {
                                    File.Delete(fullPath);
                                    fileDeleted = true;
                                }
                                catch
                                {
                                }
                            }
                        }

                        try
                        {
                            File.Delete(trackingFile);
                        }
                        catch
                        {
                        }

                        var directoriesToCheck = installedFiles
                            .Select(f => Path.GetDirectoryName(Path.Combine(targetDirectory, f)))
                            .Where(d => !string.IsNullOrEmpty(d))
                            .Distinct()
                            .OrderByDescending(d => d.Length);

                        foreach (var dir in directoriesToCheck)
                        {
                            try
                            {
                                if (Directory.Exists(dir) && !Directory.EnumerateFileSystemEntries(dir).Any())
                                {
                                    Directory.Delete(dir);
                                }
                            }
                            catch
                            {
                            }
                        }
                    }
                    else
                    {
                        MessageBox0.Text = $"Cannot uninstall {mod.Name}: No installation tracking found. This mod may have been installed with an older version.";
                        return;
                    }
                }
                else
                {
                    var targetPath = Path.Combine(targetDirectory, fileName);

                    if (File.Exists(targetPath))
                    {
                        try
                        {
                            File.Delete(targetPath);
                            fileDeleted = true;
                        }
                        catch
                        {
                        }
                    }
                    else
                    {
                        var files = Directory.GetFiles(targetDirectory, fileName, SearchOption.AllDirectories);

                        foreach (var file in files)
                        {
                            try
                            {
                                File.Delete(file);
                                fileDeleted = true;
                                break;
                            }
                            catch
                            {
                            }
                        }
                    }
                }
            }

            if (fileDeleted)
            {
                statusText.Text = "Not installed";
                statusBadge.Background = GetNeutralBrush();
                statusText.Foreground = GetSecondaryBrush();
                installButton.Content = "Install";
                installButton.Background = GetSuccessBrush();

                if (uninstallButton.Parent is StackPanel parent)
                {
                    parent.Children.Remove(uninstallButton);
                }

                MessageBox0.Text = $"Successfully uninstalled {mod.Name}!";
            }
            else
            {
                MessageBox0.Text = $"Could not find {mod.Name} files to uninstall.";
            }
        }
        catch (Exception ex)
        {
            await ShowErrorMessage($"Could not uninstall {mod.Name}: {ex.Message}");
        }
    }

    private async Task<string> DownloadFile(string url, string fileName)
    {
        try
        {
            // Use a more unique temp directory to avoid conflicts
            var downloadDir = Path.Combine(Path.GetTempPath(), "MonkeModManager", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(downloadDir);

            var filePath = Path.Combine(downloadDir, fileName);

            // Download with progress reporting
            using var response = await httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength;

            await using var contentStream = await response.Content.ReadAsStreamAsync();
            await using var fileStream = File.Create(filePath);

            var buffer = new byte[8192];
            int bytesRead;
            long totalRead = 0;

            while ((bytesRead = await contentStream.ReadAsync(buffer)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead));
                totalRead += bytesRead;

                if (totalBytes.HasValue)
                {
                    var progress = (int)((totalRead * 100) / totalBytes.Value);
                    Dispatcher.UIThread.Post(() =>
                    {
                        ProgressBarAtStart.Value = progress;
                        ProgressBarAtStart.IsVisible = true;
                    });
                }
            }

            Dispatcher.UIThread.Post(() =>
            {
                ProgressBarAtStart.IsVisible = false;
            });

            return filePath;
        }
        catch (HttpRequestException ex)
        {
            throw new Exception($"Network error: {ex.Message}");
        }
        catch (Exception ex)
        {
            throw new Exception($"Download failed: {ex.Message}");
        }
    }

    

    private async Task<bool> CheckOrInstallBepInEx()
    {
        try
        {
            var bepInExPath = Path.Combine(gamePath, "BepInEx");
            
            if (!Directory.Exists(bepInExPath))
            {
                MessageBox0.Text = "BepInEx not found. Downloading...";
                
                var bytes = await httpClient.GetByteArrayAsync(
                    "https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.3/BepInEx_win_x64_5.4.23.3.zip");
                
                var tempPath = Path.Combine(Path.GetTempPath(), $"BepInEx_{Guid.NewGuid()}.zip");
                await File.WriteAllBytesAsync(tempPath, bytes);
                
                MessageBox0.Text = "Extracting BepInEx please wait!!!!!";
                await ExtractBepInEx(tempPath);
                
                File.Delete(tempPath);
                await fixBepInExConfig();
                await FixUEConfig();
                MessageBox0.Text = "BepInEx installed successfully!";
                
                return true;
            }
            
            MessageBox0.Text = "BepInEx already installed.";
            return true;
        }
        catch (Exception ex)
        {
            await ShowErrorMessage($"couldnt install bepinex: {ex.Message}");
            return false;
        }
    }

    private async Task ExtractBepInEx(string zipPath)
    {
        try
        {
            using var archive = ZipFile.OpenRead(zipPath);

            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name))
                    continue;

                var destinationPath = Path.Combine(gamePath, entry.FullName);
                var directory = Path.GetDirectoryName(destinationPath);
                
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                entry.ExtractToFile(destinationPath, overwrite: true);
            }
        }
        catch (Exception ex)
        {
            throw new Exception($"couldnr extract {ex.Message}");
        }
    }
    private async Task InstallFromDisk(string modPath = null)
    {
        try
        {
            if (modPath == null)
            {
                MessageBox0.Text = "Installing...";

                var filePickerOptions = new FilePickerOpenOptions()
                {
                    Title = "Select Mod File",
                    AllowMultiple = false,
                    FileTypeFilter = new[]
                    {
                        new FilePickerFileType("DLL Files") { Patterns = new[] { "*.dll" } }
                    }
                };

                var files = await MainWin.StorageProvider.OpenFilePickerAsync(filePickerOptions);

                if (files == null || files.Count == 0) return;

                var selectedFile = files[0];
                var fileName = selectedFile.Name;
                var sourcePath = selectedFile.Path.LocalPath;
                var modFolderName = Path.GetFileNameWithoutExtension(fileName);
                var targetDirectory = Path.Combine(gamePath, "BepInEx", "plugins", modFolderName);

                Directory.CreateDirectory(targetDirectory);

                var targetPath = Path.Combine(targetDirectory, fileName);
                File.Copy(sourcePath, targetPath, overwrite: true);

                MessageBox0.Text = $"Successfully installed {fileName}!";
            }
            else
            {
                var fileName = Path.GetFileName(modPath);
                var modFolderName = Path.GetFileNameWithoutExtension(fileName);
                var targetDirectory = Path.Combine(gamePath, "BepInEx", "plugins", modFolderName);

                Directory.CreateDirectory(targetDirectory);

                var targetPath = Path.Combine(targetDirectory, fileName);
                File.Copy(modPath, targetPath, overwrite: true);

                MessageBox0.Text = $"Successfully installed {fileName}!";
            }
        }
        catch (Exception ex)
        {
            await ShowErrorMessage($"Failed to install from disk: {ex.Message}");
            MessageBox0.Text = "Installation failed";
        }
    }


    private async Task SilentInstall(string url)
    {
        var file = await DownloadFile(url, "SilentInstall.dll");
        await InstallFromDisk(file);
    }
    private bool TryFindModByName(string modName, out Mod foundMod)
    {
        foundMod = Mods.FirstOrDefault(m => m.Name.Equals(modName, StringComparison.OrdinalIgnoreCase));
        return foundMod != null;
    }

    private bool TryFindBorderByMod(Mod mod, out Border foundBorder)
    {
        foundBorder = ModControls.FirstOrDefault(m => m.Tag.ToString().Equals(mod.Name, StringComparison.OrdinalIgnoreCase));
        return foundBorder != null;
    }
    #endregion
    
    #region Game Path Stuff
    private string GetGamePath()
    {
        try
        {
            if (!File.Exists(GetConfigPath()))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(GetConfigPath()));
                File.WriteAllText(GetConfigPath(), JsonConvert.SerializeObject(new Config
                {
                    GamePath = ""
                }, Formatting.Indented));
                return null;
            }

            var json = File.ReadAllText(GetConfigPath());
            var config = JsonConvert.DeserializeObject<Config>(json);
            
            if (!string.IsNullOrWhiteSpace(config?.GamePath) && Directory.Exists(config.GamePath))
            {
                return config.GamePath;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error reading the config{ex.Message}");
        }
        
        return null;
    }

    private async Task<string> ShowGamePathDialog()
    {
        var dialog = new Window
        {
            Title = "Select Game Path",
            Width = 500,
            Height = 250,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            CanResize = false
        };

        var stackPanel = new StackPanel
        {
            Margin = new Thickness(20),
            Spacing = 15
        };

        stackPanel.Children.Add(new TextBlock
        {
            Text = "Select your game path:",
            FontSize = 14,
            FontWeight = FontWeight.Medium
        });

        var pathTextBox = new TextBox
        {
            IsReadOnly = true,
            Height = 32,
            Background = Brushes.LightGray
        };

        var browseButton = new Button
        {
            Content = "Browse",
            Width = 100,
            Height = 32,
            HorizontalAlignment = HorizontalAlignment.Left
        };

        var buttonPanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 10, 0, 0)
        };

        var okButton = new Button
        {
            Content = "OK",
            Width = 80,
            Height = 32,
            IsEnabled = false
        };

        var cancelButton = new Button
        {
            Content = "Cancel",
            Width = 80,
            Height = 32
        };

        string selectedPath = null;

        browseButton.Click += async (sender, e) =>
        {
            var folderDialog = new OpenFolderDialog
            {
                Title = "Select Game Folder"
            };

            var result = await folderDialog.ShowAsync(this);
            if (!string.IsNullOrEmpty(result))
            {
                pathTextBox.Text = result;
                selectedPath = result;
                okButton.IsEnabled = true;
            }
        };

        okButton.Click += (sender, e) =>
        {
            dialog.Close();
        };

        cancelButton.Click += (sender, e) =>
        {
            selectedPath = null;
            dialog.Close();
        };

        buttonPanel.Children.Add(cancelButton);
        buttonPanel.Children.Add(okButton);

        stackPanel.Children.Add(pathTextBox);
        stackPanel.Children.Add(browseButton);
        stackPanel.Children.Add(buttonPanel);

        dialog.Content = stackPanel;

        await dialog.ShowDialog(this);
        return selectedPath;
    }
    #endregion
    
    #region Config Editor

    public static async Task ShowConfigPickerAsync(Window parent, string GamePath)
    {
        string configDir = Path.Combine(GamePath, "BepInEx", "config");

        var pickerWindow = new Window
        {
            Title = "Config Editor That Edits Config Files",
            Width = 400,
            Height = 600,
            Background = Instance.getBGForTheme(),
            WindowStartupLocation = WindowStartupLocation.CenterOwner
        };

        var stackPanel = new StackPanel
        {
            Orientation = Orientation.Vertical,
            Margin = new Thickness(10),
            Spacing = 8
        };

        if (!Directory.Exists(configDir))
        {
            stackPanel.Children.Add(new TextBlock
            {
                Text = $"Directory not found:\n{configDir}",
                Foreground = Brushes.Red
            });
        }
        else
        {
            var cfgFiles = Directory.GetFiles(configDir, "*.cfg", SearchOption.TopDirectoryOnly);
            if (cfgFiles.Length == 0)
            {
                stackPanel.Children.Add(new TextBlock
                {
                    Text = "No .cfg files found.",
                    FontStyle = FontStyle.Italic,
                    Foreground = Instance.getTextTheme()
                });
            }
            else
            {
                foreach (var file in cfgFiles.OrderBy(Path.GetFileName))
                {
                    var text = "a";
                    if (file.EndsWith("BepInEx.cfg"))
                    {
                        text = $"{Path.GetFileName(file)} - FOR EXPERIENCED USERS ONLY!";
                    }
                    else
                    {
                        text = Path.GetFileName(file);
                    }
                    var btn = new Button
                    {
                        Content = text,
                        Foreground = Brushes.White,
                        Background = Brush.Parse("#3F51B5"),
                        Tag = file,
                        HorizontalAlignment = HorizontalAlignment.Stretch
                    };

                    btn.Click += async (_, __) =>
                    {
                        try
                        {
                            var config = ConfigFile.Load(file);
                            var editor = new ConfigEditorDialog(config);
                            bool result = await editor.ShowDialog<bool>(pickerWindow);

                            if (result)
                            {
                                config.Save(file);
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine(ex);
                        }
                    };

                    stackPanel.Children.Add(btn);
                }
            }
        }

        pickerWindow.Content = new ScrollViewer
        {
            Content = stackPanel
        };

        await pickerWindow.ShowDialog(parent);
    }
    #endregion 

    #region Error Handling
    private async Task ShowErrorMessage(string message)
    {
        MessageBox0.Text = $"Error: {message}";
        Console.WriteLine($"Error: {message}");
        
        var errorDialog = new Window
        {
            Title = "an ERROR has errored your app",
            Width = 400,
            Height = 200,
            WindowStartupLocation = WindowStartupLocation.CenterOwner
        };

        var content = new StackPanel
        {
            Margin = new Thickness(20),
            Spacing = 15
        };

        content.Children.Add(new TextBlock
        {
            Text = message,
            TextWrapping = TextWrapping.Wrap,
            FontSize = 12
        });

        var okButton = new Button
        {
            Content = "OK",
            Width = 80,
            HorizontalAlignment = HorizontalAlignment.Center
        };

        okButton.Click += (s, e) => errorDialog.Close();
        content.Children.Add(okButton);

        errorDialog.Content = content;
        await errorDialog.ShowDialog(this);
    }
    #endregion
    
    #region Version Checking Stuff

    private async Task NewVersionDialog(Version version)
    {
        var dialog = new Window
        {
            Title = "New Version Available!!!",
            Width = 500,
            Height = 250,
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
        };

        var content = new StackPanel
        {
            Margin = new Thickness(20),
            Spacing = 15
        };

        dialog.Content = content;

        var text = new TextBlock
        {
            Text = "New Version Available",
            TextWrapping = TextWrapping.Wrap,
        };

        var installBtn = new Button
        {
            Content = "Install",
        };
        installBtn.Click += async (sender, e) =>
        {
            var url = "https://github.com/arielthemonke/MonkeModManager/releases/latest";
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        };

        var closeBtn = new Button
        {
            Content = "Close",
        };
        closeBtn.Click += async (sender, e) =>
        {
            dialog.Close();
        };
        content.Children.Add(text);
        content.Children.Add(installBtn);
        content.Children.Add(closeBtn);
        var owner = (Application.Current.ApplicationLifetime as IClassicDesktopStyleApplicationLifetime)?.MainWindow;
        await dialog.ShowDialog(owner);
    }
    #endregion
    
    #region cant think of name
    protected override void OnClosed(EventArgs e)
    {
        Console.WriteLine("[DiscordRPC] - Disposing.........");
        httpClient?.Dispose();
        client?.ClearPresence();
        client?.Deinitialize();
        client?.Dispose();
        Console.WriteLine("[DiscordRPC] - Disposed");
        base.OnClosed(e);
    }

    private void LaunchBtn_OnClick(object? sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "steam://rungameid/1533390",
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            _ = ShowErrorMessage("Failed to launch game: " + ex.Message + "\nplease note that the launch game feature is steam only");
        }
    }

    private void InstallFromDiskBtn_OnClick(object? sender, RoutedEventArgs e)
    {
        _ = InstallFromDisk();
    }
    
    private void Config_OnClick(object? sender, RoutedEventArgs e)
    {
        _ = ShowConfigPickerAsync(this, GetGamePath());
    }

    void OpenModsFolder_OnClick(object? sender, RoutedEventArgs e)
    {
        var ModsPath = Path.Combine(gamePath, "BepInEx", "plugins");
        OpenFolder(ModsPath);
    }

    void OpenGamePath_OnClick(object? sender, RoutedEventArgs e)
    {
        OpenFolder(gamePath);
    }

    void DisableAll_OnClick(object? sender, RoutedEventArgs e)
    {
        string dllPath = Path.Combine(gamePath, "winhttp.dll");
        string disabledPath = Path.Combine(gamePath, "disabled.mods");
        try
        {
            if (!ModsDisabled())
            {
                File.Move(dllPath, disabledPath);
                Console.WriteLine("Mods disabled.");
                DisableEnable.Header = "Enable Mods";
                SendNeededMesages();
            }
            else if (File.Exists(disabledPath))
            {
                File.Move(disabledPath, dllPath);
                Console.WriteLine("Mods re-enabled.");
                DisableEnable.Header = "Disable Mods";
                SendNeededMesages();
            }
            else
            {
                Console.WriteLine("No mods found to disable/enable.");
            }
        }
        catch (IOException ex)
        {
            Console.WriteLine($"didnt work {ex}");
        }
    }

    void InstallAll(object? sender, RoutedEventArgs e)
    {
        foreach (var mod in modBorders)
        {
            _ = InstallMod(mod.ModAssigned, mod.InstallButton, mod.StatusText);
        }
    }

    void OpenFolder(string Path)
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            Process.Start(new ProcessStartInfo() { FileName = Path, UseShellExecute = true });
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            Process.Start("xdg-open", $"\"{Path}\"");
        }
    }
    private void ResetGamePath_OnClick(object? sender, RoutedEventArgs e)
    {
        _ = ChangeTheGamePathBecauseINeedTaskForSomeReason();
    }

    async Task ChangeTheGamePathBecauseINeedTaskForSomeReason()
    {
        var path = await ShowGamePathDialog();
        await SaveConfig(path, GetTheme());
        await CheckOrInstallBepInEx();
    }
    #endregion
}

#region other classes/enums
public enum Theme
{
    Light,
    Dark,
    DarkHighContrast,
    Sunrise,
    Frost
}

public class Mod
{
    public string Name { get; set; }
    public string Author { get; set; }
    public string Version { get; set; }
    public List<string> Dependencies { get; set; } = new List<string>();
    public List<Mod> DependenciesAsMod { get; set; } = new List<Mod>();
    [JsonProperty("install_location")]
    public string InstallLocation { get; set; }
    [JsonProperty("git_path")]
    public string GitPath { get; set; }
    public string Group { get; set; }
    [JsonProperty("download_url")]
    public string DownloadUrl { get; set; }

    public string ModName => Name;
    public string URL => DownloadUrl;
    public string DisplayName => $"{Name} v{Version}";
    public string AuthorInfo => !string.IsNullOrEmpty(Author) ? $"by {Author}" : "";
}

public class Config
{
    public string GamePath { get; set; }
    public Theme Theme { get; set; }
}

public class ModBorderThingyForDictionary
{
    public Border border { get; set; }
    public Button InstallButton { get; set; }
    public TextBlock StatusText { get; set; }
    public Border StatusBadge { get; set; }
    public Button UninstallButton { get; set; }
    public Mod ModAssigned { get; set; }
}
#endregion
// you made it till the end!
