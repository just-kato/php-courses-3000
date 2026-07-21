'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { LessonProgress, UserLesson, UserModule } from '@/lib/db-types';
import { lessonLabel } from '@/lib/db-types';

export type ModuleWithLessons = UserModule & { lessons: UserLesson[] };

type SidebarProps = {
  modules: ModuleWithLessons[];
  lpMap: Map<string, LessonProgress>;
  activeLessonId?: string | null;
  activeModuleId?: string | null;
  open: boolean;
  onClose: () => void;
  getLessonHref: (lesson: UserLesson, mod: UserModule) => string;
  getModuleHref?: (mod: UserModule) => string;
  allHref?: string;
};

type TreeProps = SidebarProps & {
  collapsed: Record<string, boolean>;
  toggle: (id: string) => void;
};

function SidebarTree({
  modules,
  lpMap,
  activeLessonId,
  activeModuleId,
  allHref,
  getLessonHref,
  getModuleHref,
  collapsed,
  toggle,
  onClose,
}: TreeProps) {
  const allActive = !activeLessonId && !activeModuleId;

  return (
    <div className="flex flex-col pb-6">
      {allHref && (
        <div className="px-3 pt-3 pb-1">
          <Link
            href={allHref}
            onClick={onClose}
            className={`flex items-center px-2 py-1.5 rounded font-sans text-sm font-medium transition-colors ${
              allActive
                ? 'bg-accent/10 text-accent'
                : 'text-ink-2 hover:text-ink hover:bg-paper'
            }`}
          >
            All
          </Link>
        </div>
      )}

      <div className="px-3 space-y-1">
        {modules.map((mod, modIdx) => {
          const isCollapsed = collapsed[mod.id] ?? false;
          const modActive = !activeLessonId && activeModuleId === mod.id;
          const readCount = mod.lessons.filter((l) => lpMap.get(l.id)?.read).length;

          return (
            <div key={mod.id} className="mt-2">
              <div className="flex items-center gap-1">
                {getModuleHref ? (
                  <Link
                    href={getModuleHref(mod)}
                    onClick={onClose}
                    className={`flex-1 min-w-0 flex items-baseline gap-1.5 px-2 py-1.5 rounded font-sans text-xs font-semibold transition-colors ${
                      modActive
                        ? 'bg-accent/10 text-accent'
                        : 'text-ink-2 hover:text-ink hover:bg-paper'
                    }`}
                  >
                    <span className="truncate">Module {modIdx + 1}</span>
                    <span className="font-normal text-ink-2/60 tabular-nums shrink-0">
                      {readCount}/{mod.lessons.length}
                    </span>
                  </Link>
                ) : (
                  <span className="flex-1 px-2 py-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-ink-2/70">
                    Module {modIdx + 1}
                  </span>
                )}
                <button
                  onClick={() => toggle(mod.id)}
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  className="shrink-0 p-1 rounded hover:bg-paper text-ink-2/50 hover:text-ink-2 transition-colors"
                >
                  <svg
                    className={`w-3 h-3 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {!isCollapsed && mod.lessons.length > 0 && (
                <div className="ml-2 mt-0.5 space-y-0.5">
                  {mod.lessons.map((lesson) => {
                    const read = lpMap.get(lesson.id)?.read === true;
                    const active = activeLessonId === lesson.id;
                    return (
                      <Link
                        key={lesson.id}
                        href={getLessonHref(lesson, mod)}
                        onClick={onClose}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded font-sans text-xs leading-snug transition-colors ${
                          active
                            ? 'bg-accent/10 text-accent'
                            : 'text-ink-2 hover:text-ink hover:bg-paper'
                        }`}
                      >
                        <span
                          className={`shrink-0 w-1.5 h-1.5 rounded-full border transition-colors ${
                            read ? 'bg-sage border-sage' : 'border-ink-2/40'
                          }`}
                        />
                        <span className="flex-1 min-w-0 truncate">{lessonLabel(lesson)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  const treeProps = { ...props, collapsed, toggle };

  return (
    <>
      {/* Desktop: persistent panel */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-rule bg-card overflow-y-auto">
        <SidebarTree {...treeProps} />
      </aside>

      {/* Mobile: slide-in drawer */}
      {props.open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/20 md:hidden"
            onClick={props.onClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-card border-r border-rule md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-rule shrink-0">
              <span className="font-serif text-sm font-semibold text-ink">Contents</span>
              <button
                onClick={props.onClose}
                className="p-1.5 rounded hover:bg-paper text-ink-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarTree {...treeProps} />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
