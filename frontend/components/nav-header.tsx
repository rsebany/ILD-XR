"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bell,
  ChevronDown,
  Moon,
  Sun,
  User,
  Server,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/theme-provider";
import { useNotifications } from "@/hooks/notifications";
import { useAuth } from "@/contexts/auth-context";
import { useConfirm } from "@/components/feedback";
import { notify } from "@/lib/notify";
import { useApiHealth, getApiHealthUiStatus } from "@/hooks/app";
import { NotificationsPopup } from "@/components/features/notifications/NotificationsPopup";
import { SidebarTrigger } from "@/components/ui/sidebar";

type NavHeaderProps = {
  userMenuOpen: boolean;
  onUserMenuToggle: () => void;
  title: string;
  subtitle?: string;
  searchPlaceholder?: string;
  breadcrumb?: string;
};

export function NavHeader({
  userMenuOpen,
  onUserMenuToggle,
  title,
  subtitle,
  searchPlaceholder = "Search…",
  breadcrumb,
}: NavHeaderProps) {
  const { darkMode, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const {
    unreadCount,
    notifications,
    markAsRead,
    removeNotification,
    clearAllNotifications,
    query,
    deleteMutation,
    clearMutation,
  } = useNotifications({ limit: 100 });

  const displayUnreadCount = query.isError ? 0 : unreadCount;

  const healthQuery = useApiHealth();
  const apiUi = getApiHealthUiStatus({
    isPending: healthQuery.isPending,
    isError: healthQuery.isError,
    isSuccess: healthQuery.isSuccess,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(e.target as Node)
      ) {
        setNotificationMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    onUserMenuToggle();
    const ok = await confirm({
      title: "Sign out?",
      description:
        "You will need to sign in again to use the workspace and viewers.",
      confirmText: "Sign out",
      cancelText: "Stay signed in",
    });
    if (!ok) return;
    logout();
    notify.success("Signed out");
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ild-border bg-background px-3 py-3 sm:gap-3 sm:px-4 sm:py-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <SidebarTrigger className="md:hidden" />
        <div className="flex min-w-0 flex-col">
          {breadcrumb && (
            <div className="truncate text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {breadcrumb}
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold text-foreground sm:text-sm md:text-base">{title}</h1>
            {subtitle && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                • {subtitle}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div
          className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex ${
            apiUi === "online"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : apiUi === "offline"
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : "border-border bg-muted/60 text-muted-foreground"
          }`}
          title="Backend API status"
        >
          <Server className="h-3 w-3 shrink-0" />
          <span className="max-w-[7rem] truncate">
            {apiUi === "checking" && "API …"}
            {apiUi === "online" && "Online"}
            {apiUi === "offline" && "Offline"}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted/70 hover:bg-muted"
          aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? (
            <Sun className="h-4 w-4 text-primary" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <div className="relative" ref={notificationRef}>
          <button
            type="button"
            onClick={() => setNotificationMenuOpen((v) => !v)}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted/70 hover:bg-muted"
            aria-label="Notifications"
            aria-expanded={notificationMenuOpen}
          >
            <Bell className="h-4 w-4 text-primary" />
            {displayUnreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {displayUnreadCount > 99 ? "99+" : displayUnreadCount}
              </span>
            )}
          </button>
          <NotificationsPopup
            open={notificationMenuOpen}
            onClose={() => setNotificationMenuOpen(false)}
            unreadCount={unreadCount}
            notifications={notifications}
            isLoading={query.isLoading}
            isError={query.isError}
            markAsRead={markAsRead}
            removeNotification={removeNotification}
            clearAllNotifications={clearAllNotifications}
            isDeleting={deleteMutation.isPending}
            isClearing={clearMutation.isPending}
          />
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={onUserMenuToggle}
            className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-muted/70 px-2.5 text-sm hover:bg-muted sm:gap-2 sm:px-3"
            aria-expanded={userMenuOpen}
            aria-haspopup="true"
          >
            <User className="h-4 w-4 text-primary" />
            <span className="hidden text-xs font-medium text-foreground sm:inline">
              {user?.full_name ?? "User"}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                aria-hidden="true"
                onClick={onUserMenuToggle}
              />
              <div
                className="absolute right-0 z-20 mt-2 w-40 rounded-lg border border-border bg-card py-1 text-xs shadow-lg"
                role="menu"
              >
                <Link
                  href="/settings"
                  className="flex w-full items-center px-3 py-1.5 text-left text-foreground hover:bg-muted/70"
                  role="menuitem"
                  onClick={onUserMenuToggle}
                >
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-1.5 text-left text-foreground hover:bg-muted/70"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
