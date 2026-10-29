import { useQuery } from "@tanstack/react-query";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { queryKeys } from "@/lib/queryKeys";
import {
  Activity,
  GitPullRequest,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import { SidebarNavItem } from "../SidebarNavItem";
import { contextualSidebarStyles } from "../contextual-sidebar-styles";
import { useTranslation } from "@/i18n";

export function ChatDetailSidebar({
  endpointId,
  NavItem = SidebarNavItem,
}: {
  endpointId: string;
  NavItem?: typeof SidebarNavItem;
}) {
  const { t } = useTranslation();
  const endpoint = useQuery({
    queryKey: queryKeys.chatEndpoints.detail(endpointId),
    queryFn: () => chatEndpointsApi.get(endpointId),
    enabled: Boolean(endpointId),
  });
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-border bg-background">
      <nav
        aria-label={t("ui2g5.chatDetailSidebar.connection")}
        data-slot="contextual-sidebar-nav"
        className={contextualSidebarStyles.nav}
      >
        <div
          data-slot="contextual-sidebar-group"
          className={contextualSidebarStyles.group}
        >
          <NavItem
            to={`/apps/chat/${endpointId}/settings`}
            label={t("ui2g5.chatDetailSidebar.settings")}
            icon={Settings}
            end
          />
          <NavItem
            to={`/apps/chat/${endpointId}/access`}
            label={t("ui2g5.chatDetailSidebar.access")}
            icon={Users}
            end
          />
          {endpoint.data?.provider === "github" && (
            <NavItem
              to={`/apps/chat/${endpointId}/reviews`}
              label={t("ui2g5.chatDetailSidebar.reviews")}
              icon={GitPullRequest}
            />
          )}
          <NavItem
            to={`/apps/chat/${endpointId}/conversations`}
            label={t("ui2g5.chatDetailSidebar.conversations")}
            icon={MessageSquare}
            end
          />
          <NavItem
            to={`/apps/chat/${endpointId}/activity`}
            label={t("ui2g5.chatDetailSidebar.activity")}
            icon={Activity}
            end
          />
        </div>
      </nav>
    </aside>
  );
}
