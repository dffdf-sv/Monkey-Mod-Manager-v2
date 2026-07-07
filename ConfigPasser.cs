using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

public class ConfigSetting
{
    public string Key { get; set; }
    public string Value { get; set; }
    public string Type { get; set; }
    public string DefaultValue { get; set; }
    public List<string> AcceptableValues { get; set; } = new();
    public string Description { get; set; }
}

public class ConfigSection : Dictionary<string, ConfigSetting>
{
    public string Name { get; set; }

    public ConfigSection(string name)
    {
        Name = name;
    }
}

public class ConfigFile : Dictionary<string, ConfigSection>
{
    public static ConfigFile Load(string path)
    {
        var cfg = new ConfigFile();
        string currentSection = null;
        List<string> commentBuffer = new();

        foreach (var rawLine in File.ReadLines(path))
        {
            var line = rawLine.Trim();

            if (string.IsNullOrWhiteSpace(line))
                continue;

            if (line.StartsWith("[") && line.EndsWith("]"))
            {
                currentSection = line[1..^1];
                if (!cfg.ContainsKey(currentSection))
                    cfg[currentSection] = new ConfigSection(currentSection);
                continue;
            }

            if (line.StartsWith("#"))
            {
                commentBuffer.Add(line.TrimStart('#').Trim());
                continue;
            }

            if (line.Contains('='))
            {
                var parts = line.Split('=', 2);
                var key = parts[0].Trim();
                var value = parts[1].Trim();

                var setting = new ConfigSetting
                {
                    Key = key,
                    Value = value
                };

                foreach (var comment in commentBuffer)
                {
                    if (comment.StartsWith("Setting type:", StringComparison.OrdinalIgnoreCase))
                        setting.Type = comment.Substring(13).Trim();
                    else if (comment.StartsWith("Default value:", StringComparison.OrdinalIgnoreCase))
                        setting.DefaultValue = comment.Substring(14).Trim();
                    else if (comment.StartsWith("Acceptable values:", StringComparison.OrdinalIgnoreCase))
                        setting.AcceptableValues = comment.Substring(18).Split(',').Select(v => v.Trim()).ToList();
                    else
                        setting.Description += (setting.Description != null ? " " : "") + comment;
                }

                cfg[currentSection][key] = setting;
                commentBuffer.Clear();
            }
        }

        return cfg;
    }

    public void Save(string path)
    {
        using var writer = new StreamWriter(path);
        foreach (var section in this.Values)
        {
            writer.WriteLine($"[{section.Name}]");
            foreach (var setting in section.Values)
            {
                if (!string.IsNullOrWhiteSpace(setting.Description))
                    writer.WriteLine($"## {setting.Description}");
                if (!string.IsNullOrWhiteSpace(setting.Type))
                    writer.WriteLine($"# Setting type: {setting.Type}");
                if (!string.IsNullOrWhiteSpace(setting.DefaultValue))
                    writer.WriteLine($"# Default value: {setting.DefaultValue}");
                if (setting.AcceptableValues.Any())
                    writer.WriteLine($"# Acceptable values: {string.Join(", ", setting.AcceptableValues)}");

                writer.WriteLine($"{setting.Key} = {setting.Value}");
                writer.WriteLine();
            }
        }
    }

    public string GetString(string section, string key)
    {
        if (this.TryGetValue(section, out var sec) && sec.TryGetValue(key, out var setting))
            return setting.Value.Trim('"');
        throw new KeyNotFoundException($"Setting '{key}' in section '{section}' not found.");
    }

    public int GetInt(string section, string key)
    {
        if (int.TryParse(GetString(section, key), out var result))
            return result;
        throw new FormatException($"Setting '{key}' in section '{section}' is not a valid integer.");
    }

    public bool GetBool(string section, string key)
    {
        var val = GetString(section, key).ToLowerInvariant();
        if (val == "true" || val == "1") return true;
        if (val == "false" || val == "0") return false;
        throw new FormatException($"Setting '{key}' in section '{section}' is not a valid boolean.");
    }

    public void Set(string section, string key, object value)
    {
        if (!this.TryGetValue(section, out var sec))
            this[section] = sec = new ConfigSection(section);

        if (!sec.TryGetValue(key, out var setting))
            sec[key] = setting = new ConfigSetting { Key = key };

        setting.Value = value.ToString().ToLowerInvariant();
    }
}