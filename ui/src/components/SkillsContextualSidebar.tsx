import { GithubIcon } from "@/components/icons/github-icon";
import { Compass, Library, PencilRuler } from "lucide-react";
import { useLocation } from "@/lib/router";
import {
  resolveSkillsNavigationView,
  SKILLS_NAVIGATION_HREFS,
} from "@/pages/skills/skills-navigation";
import { useTranslation } from "@/i18n";
import { ContextualSidebarFrame } from "./ContextualSidebarFrame";
import { SidebarNavItem } from "./SidebarNavItem";
import { contextualSidebarStyles } from "./contextual-sidebar-styles";

export {
  resolveSkillsDiscoveryView,
  resolveSkillsNavigationView,
  SKILLS_NAVIGATION_HREFS,
  withSkillsDiscoveryView,
  type SkillsNavigationView,
} from "@/pages/skills/skills-navigation";

export function SkillsContextualSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const activeView = resolveSkillsNavigationView(location.pathname, location.search);

  return (
    <ContextualSidebarFrame
      surface="skills"
      title={t("ui3g1.SkillsContextualSidebar.skills")}
      icon={Library}
      fallbackTo="/dashboard"
      showHeader={false}
      className="border-r border-border bg-background"
    >
      <nav
        aria-label={t("ui3g1.SkillsContextualSidebar.skills")}
        data-slot="contextual-sidebar-nav"
        className={contextualSidebarStyles.nav}
      >
        <div data-slot="contextual-sidebar-group" className={contextualSidebarStyles.group}>
          <SidebarNavItem
            to={SKILLS_NAVIGATION_HREFS.installed}
            label={t("ui3g1.SkillsContextualSidebar.installed")}
            icon={Library}
            active={activeView === "installed"}
            end
          />
          <SidebarNavItem
            to={SKILLS_NAVIGATION_HREFS.discover}
            label={t("ui3g1.SkillsContextualSidebar.discover")}
            icon={Compass}
            active={activeView === "discover"}
            end
          />
          <SidebarNavItem to={SKILLS_NAVIGATION_HREFS.sources} label={t("ui3g1.SkillsContextualSidebar.sources")} icon={GithubIcon} active={activeView === "sources"} />
        </div>

        <div data-slot="contextual-sidebar-section" className={contextualSidebarStyles.section}>
          <div
            data-slot="contextual-sidebar-section-label"
            className={contextualSidebarStyles.sectionLabel}
          >
            {t("ui3g1.SkillsContextualSidebar.author")}
          </div>
          <p
            data-slot="contextual-sidebar-section-description"
            className={contextualSidebarStyles.sectionDescription}
          >
            {t("ui3g1.SkillsContextualSidebar.authorDescription")}
          </p>
          <div data-slot="contextual-sidebar-group" className={contextualSidebarStyles.group}>
            <SidebarNavItem
              to={SKILLS_NAVIGATION_HREFS.authored}
              label={t("ui3g1.SkillsContextualSidebar.mySkills")}
              icon={PencilRuler}
              active={activeView === "authored"}
            />
          </div>
        </div>
      </nav>
    </ContextualSidebarFrame>
  );
}
