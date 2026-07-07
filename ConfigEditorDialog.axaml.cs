using System.Collections.Generic;
using System.Linq;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Layout;

namespace MonkeModManager;

public partial class ConfigEditorDialog : Window
{
    private readonly ConfigFile _config;

    public ConfigEditorDialog(ConfigFile config)
    {
        InitializeComponent();
        _config = config;

        Background = MainWindow.Instance.getBGForTheme();
        foreach (var section in _config)
        {
            SettingsPanel.Children.Add(new TextBlock
            {
                Text = $"[{section.Key}]",
                Foreground = MainWindow.Instance.getTextTheme(),
                FontWeight = Avalonia.Media.FontWeight.Bold,
                Margin = new Thickness(0, 10, 0, 5)
            });

            foreach (var setting in section.Value.Values)
            {
                var panel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 5 };
                panel.Children.Add(new TextBlock { Text = setting.Key, Width = 200, Foreground = MainWindow.Instance.getTextTheme() });

                Control editor;
                if (setting.Type?.ToLower() == "boolean")
                {
                    editor = new CheckBox
                    {
                        IsChecked = bool.Parse(setting.Value),
                        Tag = setting
                    };
                }
                else if (setting.AcceptableValues.Any())
                {
                    editor = new ComboBox
                    {
                        ItemsSource = setting.AcceptableValues,
                        SelectedItem = setting.Value,
                        Tag = setting
                    };
                }
                else
                {
                    editor = new TextBox
                    {
                        Text = setting.Value,
                        Width = 200,
                        Tag = setting,
                        Foreground = MainWindow.Instance.getTextTheme()
                    };
                }

                panel.Children.Add(editor);
                SettingsPanel.Children.Add(panel);
            }
        }
    }

    private void Save_Click(object? sender, RoutedEventArgs e)
    {
        foreach (var child in SettingsPanel.Children)
        {
            if (child is StackPanel sp && sp.Children.Count > 1)
            {
                var editor = sp.Children[1];
                if (editor is TextBox tb && tb.Tag is ConfigSetting txtSetting)
                    txtSetting.Value = tb.Text;
                else if (editor is CheckBox cb && cb.Tag is ConfigSetting boolSetting)
                    boolSetting.Value = cb.IsChecked.ToString().ToLower();
                else if (editor is ComboBox combo && combo.Tag is ConfigSetting enumSetting)
                    enumSetting.Value = combo.SelectedItem?.ToString();
                // I actually dont understand Rider's underlining thingy when it marks everything as warnings
                // event this ^^^ is marked as a warning, and its a comment!
            }
        }

        Close(true);
    }
}
