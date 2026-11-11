"use client";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useBalance, useChainId, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { Button, Modal, Spinner } from "@/components/ui/primitives";
import { robinhood, HL_APP_URL } from "@/lib/config";
import { fmtUsd, shortAddr } from "@/lib/format";
import { useAccountStore, selectSummary } from "@/store/account";
import { useTrading } from "@/components/providers/TradingProvider";
import { OnboardingModal } from "./OnboardingModal";
import { humanizeError } from "@/lib/hl/errors";
import { formatUnits } from "viem";

export function NetworkBadge() {
  const { isConnected } = useConnection();
  const chainId = useChainId();
  const { mutate: switchChain, isPending } = useSwitchChain();
  const onRobinhood = chainId === robinhood.id;
  if (!isConnected) return null;
  return (
    <button
      onClick={() => !onRobinhood && switchChain({ chainId: robinhood.id })}
      title={onRobinhood ? `Connected to ${robinhood.name} (chain ${robinhood.id})` : `Switch to ${robinhood.name}`}
      className={clsx(
        "hidden sm:flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs",
        onRobinhood ? "border-line-2 text-fg" : "border-warn/40 text-warn bg-warn/5 hover:bg-warn/10",
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", onRobinhood ? "bg-accent" : "bg-warn")} />
      {isPending ? "Switching…" : onRobinhood ? robinhood.name : "Wrong network"}
    </button>
  );
}

export function WalletButton() {
  const { address, isConnected, connector } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending, variables } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const states = useAccountStore((s) => s.states);
  const loaded = useAccountStore((s) => s.loaded);
  const { status, revoke } = useTrading();
  const { data: gasBal } = useBalance({ address, chainId: robinhood.id, query: { enabled: !!address } });
  const menuRef = useRef<HTMLDivElement>(null);
  const equity = selectSummary(states).equity;

  useEffect(() => {
    const h = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const open = () => setOnboardOpen(true);
    const connect = () => { setConnectError(null); setPickerOpen(true); };
    window.addEventListener("elyperp:onboard", open);
    window.addEventListener("elyperp:connect", connect);
    return () => {
      window.removeEventListener("elyperp:onboard", open);
      window.removeEventListener("elyperp:connect", connect);
    };
  }, []);

  // Deduplicate: the generic "Injected" connector is redundant when EIP-6963 wallets are discovered.
  const list = connectors.filter((c) => !(c.id === "injected" && connectors.some((o) => o.type === "injected" && o.id !== "injected")));

  if (!isConnected) {
    return (
      <>
        <Button variant="accent" onClick={() => { setConnectError(null); setPickerOpen(true); }} className="!py-1.5">Connect Wallet</Button>
        <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Connect a wallet">
          <div className="flex flex-col gap-2">
            {list.length === 0 && (
              <p className="text-xs text-muted">No wallet detected. Install MetaMask or Rabby, or configure WalletConnect.</p>
            )}
            {list.map((c) => (
              <button
                key={c.uid}
                onClick={async () => {
                  setConnectError(null);
                  try {
                    await connect({ connector: c, chainId: robinhood.id });
                    setPickerOpen(false);
                  } catch (e) {
                    setConnectError(humanizeError(e));
                  }
                }}
                className="flex items-center gap-3 rounded-md border border-line-2 bg-raised px-3 py-2.5 text-sm hover:border-accent/50"
              >
                {c.icon ? <img /* eslint-disable-line @next/next/no-img-element */ src={c.icon} alt="" className="h-5 w-5 rounded" /> : c.id === "walletConnect" ? <WalletConnectIcon /> : <span className="h-5 w-5 rounded bg-line-2" />}
                <span className="flex-1 text-left">{c.name === "Injected" ? "Browser wallet" : c.name}</span>
                {isPending && variables?.connector === c && <Spinner />}
              </button>
            ))}
            {connectError && <p className="text-xs text-short">{connectError}</p>}
            <p className="text-[11px] text-faint mt-2">
              Elyperp never asks for your seed phrase or private key. Signing happens in your wallet.
            </p>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2" ref={menuRef}>
      <NetworkBadge />
      <button
        onClick={() => setOnboardOpen(true)}
        className="hidden sm:flex flex-col items-end leading-tight px-2"
        title="Hyperliquid account equity (all dexes)"
      >
        <span className="text-[10px] text-faint">Equity</span>
        <span className="num text-xs">{loaded ? fmtUsd(equity) : <Spinner />}</span>
      </button>
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md border border-line-2 bg-raised px-2.5 py-1.5 text-xs hover:border-accent/40"
        >
          <span className={clsx("h-1.5 w-1.5 rounded-full", status === "ready" ? "bg-accent" : "bg-faint")} />
          <span className="num">{shortAddr(address)}</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 w-64 panel bg-panel-2 p-2 rise text-xs z-50">
            <div className="px-2 py-1.5 text-muted">
              <div className="num text-fg break-all">{address}</div>
              <div className="mt-1">via {connector?.name}</div>
              {gasBal && <div className="mt-1 num">{Number(formatUnits(gasBal.value, gasBal.decimals)).toFixed(4)} {robinhood.nativeCurrency.symbol} on {robinhood.name}</div>}
              <div className="mt-1">Trading key: <span className={status === "ready" ? "text-accent" : "text-warn"}>{status === "ready" ? "approved" : status}</span></div>
            </div>
            <div className="border-t border-line my-1" />
            <MenuItem onClick={() => { setOnboardOpen(true); setMenuOpen(false); }}>Deposit & account setup</MenuItem>
            <MenuItem onClick={() => navigator.clipboard?.writeText(address ?? "")}>Copy address</MenuItem>
            <MenuItem href={`${robinhood.blockExplorers?.default.url}/address/${address}`}>View on Robinhood Chain explorer</MenuItem>
            <MenuItem href={`${HL_APP_URL}/explorer/address/${address}`}>View on Hyperliquid explorer</MenuItem>
            {status === "ready" && <MenuItem onClick={() => { revoke(); setMenuOpen(false); }}>Forget trading key on this device</MenuItem>}
            <MenuItem onClick={() => { disconnect(); setMenuOpen(false); }} danger>Disconnect</MenuItem>
          </div>
        )}
      </div>
      <OnboardingModal open={onboardOpen} onClose={() => setOnboardOpen(false)} />
    </div>
  );
}

function MenuItem({ children, onClick, href, danger }: { children: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean }) {
  const cls = clsx("block w-full text-left rounded px-2 py-1.5 hover:bg-raised", danger ? "text-short" : "text-fg");
  return href ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children} ↗</a> : <button onClick={onClick} className={cls}>{children}</button>;
}

function WalletConnectIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#3b99fc" />
      <path
        d="M7.3 9.6a6.7 6.7 0 0 1 9.4 0l.3.3c.1.1.1.3 0 .4l-1 1c-.1.1-.2.1-.2 0l-.4-.4a4.7 4.7 0 0 0-6.6 0l-.4.4c-.1.1-.2.1-.2 0l-1-1c-.1-.1-.1-.3 0-.4zm11.4 2 .9.9c.1.1.1.3 0 .4l-4.1 4c-.1.1-.3.1-.4 0l-2.9-2.8h-.1l-2.9 2.8c-.1.1-.3.1-.4 0l-4.1-4c-.1-.1-.1-.3 0-.4l.9-.9c.1-.1.3-.1.4 0l2.9 2.8h.1l2.9-2.8c.1-.1.3-.1.4 0l2.9 2.8h.1l2.9-2.8c.1-.1.3-.1.4 0z"
        fill="#fff"
      />
    </svg>
  );
}
