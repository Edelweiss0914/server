package dev.cheeze.hardcore.deathban;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

final class DeathBanStore {
    private static final String BANS_PATH = "bans";

    private final File storageFile;
    private final Map<UUID, Long> bans = new ConcurrentHashMap<>();

    DeathBanStore(File storageFile) {
        this.storageFile = storageFile;
    }

    void load() {
        bans.clear();

        if (!storageFile.exists()) {
            return;
        }

        YamlConfiguration configuration = YamlConfiguration.loadConfiguration(storageFile);
        ConfigurationSection section = configuration.getConfigurationSection(BANS_PATH);
        if (section == null) {
            return;
        }

        for (String key : section.getKeys(false)) {
            try {
                UUID playerId = UUID.fromString(key);
                long expiresAt = section.getLong(key, 0L);
                if (expiresAt > 0L) {
                    bans.put(playerId, expiresAt);
                }
            } catch (IllegalArgumentException ignored) {
            }
        }
    }

    synchronized void save() throws IOException {
        File parent = storageFile.getParentFile();
        if (parent != null && !parent.exists()) {
            parent.mkdirs();
        }

        YamlConfiguration configuration = new YamlConfiguration();
        for (Map.Entry<UUID, Long> entry : bans.entrySet()) {
            configuration.set(BANS_PATH + "." + entry.getKey(), entry.getValue());
        }
        configuration.save(storageFile);
    }

    void put(UUID playerId, long expiresAt) {
        bans.put(playerId, expiresAt);
    }

    long get(UUID playerId) {
        return bans.getOrDefault(playerId, 0L);
    }

    void remove(UUID playerId) {
        bans.remove(playerId);
    }
}
