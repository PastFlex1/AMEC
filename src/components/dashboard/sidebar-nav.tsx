
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { 
  Home, 
  BarChart3, 
  Users, 
  ShoppingBag, 
  FilePlus2, 
  Package, 
  FileText, 
  CheckCircle2, 
  XCircle,
  ChevronDown,
  Wallet,
  ArrowDownToLine,
  TrendingUp,
  Settings
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavItem {
  title: string;
  href: string;
  icon: any;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarNavProps {
  role: 'admin' | 'sales';
  searchQuery?: string;
}

export function SidebarNav({ role, searchQuery = "" }: SidebarNavProps) {
  const pathname = usePathname();

  const adminGroups: NavGroup[] = [
    {
      label: "Principal",
      items: [
        { title: "Inicio", href: "/dashboard/admin", icon: Home },
        { title: "Reportes", href: "/dashboard/reports", icon: BarChart3 },
        { title: "Cierre de Caja", href: "/dashboard/cash-register", icon: Wallet },
        { title: "Inversiones", href: "/dashboard/investments", icon: TrendingUp },
        { title: "Vendedores", href: "/dashboard/salespeople", icon: Users },
      ]
    },
    {
      label: "Ventas",
      items: [
        { title: "Notas de Venta", href: "/dashboard/sales-notes", icon: ShoppingBag },
        { title: "Proformas", href: "/dashboard/proformas", icon: FilePlus2 },
        { title: "Productos", href: "/dashboard/products", icon: Package },
      ]
    },
    {
      label: "Inventario",
      items: [
        { title: "Ingreso Mercadería", href: "/dashboard/inventory-intake", icon: ArrowDownToLine },
      ]
    },
    {
      label: "Facturación",
      items: [
        { title: "Facturas", href: "/dashboard/invoices", icon: FileText },
      ]
    },
    {
      label: "SRI",
      items: [
        { title: "Autorizadas", href: "/dashboard/sri/authorized", icon: CheckCircle2 },
        { title: "Rechazadas", href: "/dashboard/sri/rejected", icon: XCircle },
        { title: "Configuración SRI", href: "/dashboard/sri/config", icon: Settings },
      ]
    }
  ];

  const salesGroups: NavGroup[] = [
    {
      label: "Operaciones de Venta",
      items: [
        { title: "Notas de Venta", href: "/dashboard/sales-notes", icon: ShoppingBag },
        { title: "Proformas", href: "/dashboard/proformas", icon: FilePlus2 },
        { title: "Productos", href: "/dashboard/products", icon: Package },
        { title: "Facturas", href: "/dashboard/invoices", icon: FileText },
        { title: "Cierre de Caja", href: "/dashboard/cash-register", icon: Wallet },
      ]
    }
  ];

  const baseGroups = role === 'admin' ? adminGroups : salesGroups;

  // Filtrar grupos y sus items basados en la búsqueda
  const filteredGroups = baseGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="space-y-4">
      {filteredGroups.map((group) => (
        <Collapsible key={group.label} defaultOpen className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold text-foreground/70 hover:text-foreground">
                {group.label}
                <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={cn(
                            "w-full transition-colors group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!justify-center",
                            isActive 
                              ? "bg-primary/10 text-primary font-semibold" 
                              : "hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <Link href={item.href}>
                            <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      ))}
      
      {filteredGroups.length === 0 && (
        <div className="px-6 py-4 text-xs text-muted-foreground text-center">
          No se encontraron resultados
        </div>
      )}
    </div>
  );
}
