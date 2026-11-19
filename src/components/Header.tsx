import { useTranslation } from "react-i18next";
import { useTheme } from "next-themes";
import { ArrowUpRight, Monitor, Moon, PlugZap, Settings2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HeaderProps {
  baseUrl: string;
  model: string;
  isConnected: boolean;
  onOpenSettings: () => void;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0];
  }
}

export function Header({ baseUrl, model, isConnected, onOpenSettings }: HeaderProps) {
  const { t } = useTranslation();
  const { theme = "system", setTheme } = useTheme();
  const host = hostOf(baseUrl);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <a href="#prompt" className="flex min-w-0 items-center gap-2.5 rounded-md">
          <img src="/logo.svg" alt="" width={24} height={24} className="size-6 shrink-0 rounded-[6px]" />
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{t("header.title")}</h1>
        </a>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-[16rem] gap-2 px-2.5"
            onClick={onOpenSettings}
            aria-label={
              isConnected
                ? `${t("app.apiSettings")}: ${t("app.connectedTo", { host, model })}`
                : `${t("app.apiSettings")}: ${t("app.notConnected")}`
            }
          >
            {isConnected ? (
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
            ) : (
              <PlugZap aria-hidden="true" className="text-warning" />
            )}
            <span className="hidden truncate sm:inline">
              {isConnected ? host : t("app.notConnected")}
            </span>
            {isConnected ? (
              <span className="hidden truncate font-mono text-[11px] text-muted-foreground md:inline">{model}</span>
            ) : null}
            {isConnected ? <Settings2 aria-hidden="true" className="sm:hidden" /> : null}
          </Button>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={t("app.theme.label")}>
                    <ThemeIcon aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("app.theme.label")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel>{t("app.theme.label")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">{t("app.theme.light")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t("app.theme.dark")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">{t("app.theme.system")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="sm" className="hidden h-8 gap-1 px-2 text-xs sm:inline-flex" asChild>
            <a
              href="https://github.com/kaizenics/image-labs-openai"
              target="_blank"
              rel="noreferrer"
              title={t("app.github")}
            >
              {t("header.github")}
              <ArrowUpRight aria-hidden="true" className="!size-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
