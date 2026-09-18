import { useTranslation } from "react-i18next";
import { Snowflake } from "lucide-react";

/**
 * The way out of a cap freeze, shown wherever a cap-frozen wallet is picked or
 * bought with.
 *
 * A `frozen_max_cap` wallet may enrol (owner's rule, 18.9.2026). Letting it
 * through silently would be the original bug turned inside out: the freeze is
 * real, and the person needs to know that enrolling is step one and donating
 * the remainder through the registrar is step two. No timing is promised —
 * the release happens when the registrar sees the donation, not on a clock
 * this app controls.
 */
export function MaxCapFreezeNotice({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className={`p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 ${className}`}
      data-testid="max-cap-freeze-notice"
    >
      <div className="flex items-start gap-2">
        <Snowflake className="h-4 w-4 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{t("freeze.maxCapPathTitle")}</p>
          <p className="text-xs text-sky-700 dark:text-sky-300">{t("freeze.maxCapPathBody")}</p>
        </div>
      </div>
    </div>
  );
}
