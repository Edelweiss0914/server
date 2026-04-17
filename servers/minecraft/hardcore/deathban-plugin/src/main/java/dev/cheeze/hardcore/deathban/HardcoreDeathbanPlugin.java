package dev.cheeze.hardcore.deathban;

import java.io.File;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.bukkit.plugin.java.JavaPlugin;

public final class HardcoreDeathbanPlugin extends JavaPlugin {
    private static final String STORAGE_FILE = "death-bans.yml";

    private DeathBanStore deathBanStore;
    private long cooldownMillis;
    private String deathKickTemplate;
    private String loginDeniedTemplate;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadPluginSettings();

        deathBanStore = new DeathBanStore(new File(getDataFolder(), STORAGE_FILE));
        deathBanStore.load();

        getServer().getPluginManager().registerEvents(new HardcoreDeathbanListener(this), this);
        getLogger().info("Hardcore death cooldown enabled for " + formatDuration(cooldownMillis) + ".");
    }

    @Override
    public void onDisable() {
        saveDeathBanStore();
    }

    long getCooldownMillis() {
        return cooldownMillis;
    }

    void recordDeathBan(UUID playerId, long expiresAt) {
        deathBanStore.put(playerId, expiresAt);
        saveDeathBanStore();
    }

    long getDeathBanExpiry(UUID playerId) {
        return deathBanStore.get(playerId);
    }

    void clearDeathBan(UUID playerId) {
        deathBanStore.remove(playerId);
        saveDeathBanStore();
    }

    String renderDeathKickMessage(long expiresAt) {
        long remainingMillis = Math.max(0L, expiresAt - System.currentTimeMillis());
        return deathKickTemplate.replace("{remaining}", formatDuration(remainingMillis));
    }

    String renderLoginDeniedMessage(long remainingMillis) {
        return loginDeniedTemplate.replace("{remaining}", formatDuration(remainingMillis));
    }

    private void reloadPluginSettings() {
        reloadConfig();

        long cooldownMinutes = Math.max(1L, getConfig().getLong("cooldown-minutes", 120L));
        cooldownMillis = TimeUnit.MINUTES.toMillis(cooldownMinutes);
        deathKickTemplate = getConfig().getString("messages.death-kick", "사망했습니다. {remaining} 후 다시 접속할 수 있습니다.");
        loginDeniedTemplate = getConfig().getString("messages.login-denied", "사망 쿨타임이 남아 있습니다. {remaining} 후 다시 접속할 수 있습니다.");
    }

    private void saveDeathBanStore() {
        if (deathBanStore == null) {
            return;
        }

        try {
            deathBanStore.save();
        } catch (IOException exception) {
            getLogger().severe("Failed to save death ban store: " + exception.getMessage());
        }
    }

    private String formatDuration(long durationMillis) {
        long totalMinutes = Math.max(1L, TimeUnit.MILLISECONDS.toMinutes(durationMillis));
        long hours = totalMinutes / 60L;
        long minutes = totalMinutes % 60L;

        if (hours <= 0L) {
            return minutes + "분";
        }

        if (minutes <= 0L) {
            return hours + "시간";
        }

        return hours + "시간 " + minutes + "분";
    }
}
