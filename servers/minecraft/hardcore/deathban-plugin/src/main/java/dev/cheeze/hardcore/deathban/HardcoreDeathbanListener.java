package dev.cheeze.hardcore.deathban;

import net.kyori.adventure.text.Component;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent.Result;
import org.bukkit.entity.Player;

final class HardcoreDeathbanListener implements Listener {
    private final HardcoreDeathbanPlugin plugin;

    HardcoreDeathbanListener(HardcoreDeathbanPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    void onPlayerDeath(PlayerDeathEvent event) {
        Player player = event.getPlayer();
        long expiresAt = System.currentTimeMillis() + plugin.getCooldownMillis();
        plugin.recordDeathBan(player.getUniqueId(), expiresAt);

        String kickMessage = plugin.renderDeathKickMessage(expiresAt);
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (player.isOnline()) {
                player.kick(Component.text(kickMessage));
            }
        });
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    void onAsyncPlayerPreLogin(AsyncPlayerPreLoginEvent event) {
        long expiresAt = plugin.getDeathBanExpiry(event.getUniqueId());
        if (expiresAt <= 0L) {
            return;
        }

        long remainingMillis = expiresAt - System.currentTimeMillis();
        if (remainingMillis <= 0L) {
            plugin.clearDeathBan(event.getUniqueId());
            return;
        }

        String denialMessage = plugin.renderLoginDeniedMessage(remainingMillis);
        event.disallow(Result.KICK_BANNED, Component.text(denialMessage));
    }
}
