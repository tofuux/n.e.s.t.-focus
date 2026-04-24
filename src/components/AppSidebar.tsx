import { LayoutDashboard, Video, CheckSquare, BarChart3 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Meetings", url: "/meetings", icon: Video },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
  { title: "Insights", url: "/insights", icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        {collapsed ? (
          <img src="/logo.png" alt="N.E.S.T icon" className="h-9 w-9 rounded-xl object-cover" />
        ) : (
          <img src="/logo_name.png" alt="N.E.S.T Neuro Emotional Support" className="w-full h-auto object-contain" />
        )}
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      activeClassName="bg-accent text-accent-foreground font-medium"
                    >
                      <item.icon className="mr-3 h-[18px] w-[18px]" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
