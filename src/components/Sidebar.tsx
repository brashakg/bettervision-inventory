"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dashboard/products", label: "Products" },
    { href: "/dashboard/collections", label: "Collections" },
    { href: "/dashboard/images", label: "Images" },
  ];

  const adminLinks = [
    { href: "/dashboard/attributes", label: "Attributes" },
    { href: "/dashboard/users", label: "Users" },
    { href: "/dashboard/locations", label: "Locations" },
    { href: "/dashboard/shopify", label: "Shopify Settings" },
  ];

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + "/");
  };

  const userRole = (session?.user as any)?.role || "USER";
  const isAdmin = userRole === "ADMIN";

  return (
    <>
      {/* Mobile hamburger button - visible only on small screens */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="sm:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-lg"
      >
        {isMobileMenuOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <Menu className="w-6 h-6" />
        )}
      </button>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, collapsible on tablet/desktop */}
      <div
        className={`
          fixed left-0 top-0 h-full z-40 bg-slate-900 text-white transition-all duration-300 flex flex-col
          ${isMobileMenuOpen ? "w-64" : "sm:w-64"}
          ${isOpen ? "w-64" : "sm:w-20"}
          ${!isMobileMenuOpen && "max-sm:hidden"}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          {isOpen && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-sm sm:text-base">
                BV
              </div>
              <div className="hidden sm:block">
                <h1 className="font-bold text-lg">Better Vision</h1>
                <p className="text-xs text-slate-400">Inventory</p>
              </div>
            </div>
          )}
          {!isOpen && (
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold mx-auto">
              BV
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-4 py-3 min-h-[44px] rounded-md transition-colors ${
                isActive(link.href)
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {isOpen && link.label}
              {!isOpen && link.label.charAt(0)}
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className={`mt-6 ${isOpen ? "px-4 py-2" : ""}`}>
                {isOpen && (
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Admin
                  </p>
                )}
              </div>
              {adminLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block px-4 py-3 min-h-[44px] rounded-md transition-colors ${
                    isActive(link.href)
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {isOpen && link.label}
                  {!isOpen && link.label.charAt(0)}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* User Info & Logout */}
        <div className="border-t border-slate-700 p-4 space-y-3">
          {isOpen && (
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-white truncate">
                {session?.user?.email}
              </p>
              <span className="inline-block bg-blue-600 text-white text-xs px-2 py-1 rounded mt-1">
                {userRole}
              </span>
            </div>
          )}
          <button
            onClick={() => {
              signOut({ callbackUrl: "/login" });
              setIsMobileMenuOpen(false);
            }}
            className="w-full text-left px-4 py-3 min-h-[44px] rounded-md text-slate-300 hover:bg-slate-800 transition-colors text-sm"
          >
            {isOpen ? "Logout" : "←"}
          </button>
        </div>

        {/* Toggle Button - hidden on mobile */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="hidden sm:block absolute -right-3 top-20 bg-slate-800 text-white rounded-full p-1 border border-slate-700 min-h-auto"
        >
          {isOpen ? "←" : "→"}
        </button>
      </div>
    </>
  );
}
