"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona } from "@/lib/session";
import { IconBox, IconCalendar, IconHome, IconList, IconPlus, IconQr } from "./icons";
import { M } from "./ui";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { color: string; stroke: number }) => ReactNode;
  match?: (path: string) => boolean;
};

export function MobileFrame({
  title,
  children,
  online,
  pending,
  onSync,
  badgeOs,
}: {
  title: string;
  children: ReactNode;
  online: boolean;
  pending: number;
  onSync?: () => void | Promise<void>;
  badgeOs?: number;
}) {
  const pathname = usePathname();
  const { lastSyncMsg, clearSyncMsg, hydrate } = useOfflineQueue();
  const { canInventario, canSolicitar, isEnfermeiro, isTecnico } = useMobilePersona();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!lastSyncMsg) return;
    const t = setTimeout(() => clearSyncMsg(), 4000);
    return () => clearTimeout(t);
  }, [lastSyncMsg, clearSyncMsg]);

  const nav = useMemo(() => {
    const items: NavItem[] = [{ href: "/mobile", label: "Início", icon: (p) => <IconHome {...p} /> }];
    if (isTecnico) {
      items.push({
        href: "/mobile/os",
        label: "OS",
        icon: (p) => <IconList {...p} />,
        match: (p) => p === "/mobile/os" || p.startsWith("/mobile/os/"),
      });
    }
    if (isEnfermeiro) {
      items.push({
        href: "/mobile/abrir",
        label: "Abrir",
        icon: (p) => <IconPlus {...p} />,
      });
      items.push({
        href: "/mobile/cronograma",
        label: "Agenda",
        icon: (p) => <IconCalendar {...p} />,
      });
      items.push({
        href: "/mobile/pedidos",
        label: "OS",
        icon: (p) => <IconList {...p} />,
      });
    }
    if (canInventario) {
      items.push({ href: "/mobile/inventario", label: "Inventário", icon: (p) => <IconBox {...p} /> });
    }
    if (!isEnfermeiro) {
      items.push({ href: "/mobile/qr", label: "QR", icon: (p) => <IconQr {...p} /> });
    }
    if (canSolicitar && !isEnfermeiro) {
      items.push({ href: "/mobile/solicitar", label: "Solicitar", icon: (p) => <IconPlus {...p} /> });
    }
    return items;
  }, [canInventario, canSolicitar, isEnfermeiro, isTecnico]);

  return (
    <div
      style={{
        minHeight: "100vh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--aion-bg-mobile)",
        fontFamily: "var(--aion-font-mobile)",
        padding: "max(12px, env(safe-area-inset-top)) 14px calc(92px + env(safe-area-inset-bottom))",
        color: "oklch(0.22 0.02 250)",
      }}
    >
      {!online && (
        <button
          type="button"
          onClick={() => onSync && void onSync()}
          style={{
            width: "100%",
            border: "none",
            flexShrink: 0,
            background: "oklch(0.55 0.16 38)",
            color: "white",
            padding: "8px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11.5,
            fontWeight: 600,
            borderRadius: 10,
            marginBottom: 10,
            cursor: onSync ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "white",
              flexShrink: 0,
              animation: "pulse-dot 1.5s infinite",
            }}
          />
          Sem conexão · {pending > 0 ? `${pending} na fila` : "fila vazia"}
        </button>
      )}
      {online && pending > 0 && (
        <div
          style={{
            background: "oklch(0.93 0.09 150)",
            color: "oklch(0.4 0.13 150)",
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            borderRadius: 10,
            marginBottom: 10,
          }}
        >
          <span>{pending} item(ns) prontos para sincronizar</span>
          {onSync && (
            <button
              type="button"
              onClick={() => void onSync()}
              style={{
                border: "none",
                background: M.primary,
                color: "white",
                borderRadius: 7,
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Sync
            </button>
          )}
        </div>
      )}

      {lastSyncMsg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "oklch(0.93 0.05 145)",
            color: "oklch(0.35 0.1 145)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {lastSyncMsg}
        </div>
      )}

      <span className="sr-only">{title}</span>
      {children}

      <nav
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "max(10px, env(safe-area-inset-bottom))",
          width: "min(448px, calc(100% - 24px))",
          background: "white",
          border: `1px solid ${M.border}`,
          borderRadius: 18,
          display: "grid",
          gridTemplateColumns: `repeat(${nav.length}, 1fr)`,
          padding: 6,
          boxShadow: "0 12px 30px -18px rgba(0,0,0,.4)",
          zIndex: 30,
        }}
      >
        {nav.map((item) => {
          const active = item.match
            ? item.match(pathname)
            : item.href === "/mobile"
              ? pathname === "/mobile"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const color = active ? M.primary : "oklch(0.55 0.02 250)";
          const showBadge = item.href === "/mobile/os" && (badgeOs ?? 0) > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textAlign: "center",
                fontSize: 10.5,
                fontWeight: 700,
                padding: "7px 2px 6px",
                borderRadius: 12,
                color,
                background: active ? "oklch(0.96 0.03 55)" : "transparent",
                textDecoration: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                position: "relative",
              }}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                {item.icon({ color, stroke: active ? 2.3 : 1.8 })}
                {showBadge && (
                  <span
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -8,
                      minWidth: 14,
                      height: 14,
                      borderRadius: 7,
                      background: "oklch(0.55 0.18 25)",
                      color: "white",
                      fontSize: 9,
                      fontWeight: 800,
                      display: "grid",
                      placeItems: "center",
                      padding: "0 3px",
                    }}
                  >
                    {badgeOs! > 9 ? "9+" : badgeOs}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
