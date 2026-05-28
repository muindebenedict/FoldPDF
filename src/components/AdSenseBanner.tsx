interface AdSenseBannerProps {
  placement: 'below-hero' | 'sidebar' | 'blog-inline' | 'sticky-bottom-mobile' | 'in-tool';
}

export function AdSenseBanner({ placement }: AdSenseBannerProps) {
  if (placement === 'sticky-bottom-mobile') {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 block border-t border-gray-100 bg-white/95 p-2 text-center shadow-lg dark:border-neutral-800 dark:bg-neutral-900 md:hidden animate-in slide-in-from-bottom duration-350">
        <div className="mx-auto flex max-w-sm items-center justify-between px-4">
          <div className="flex flex-col text-left">
            <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase">Sponsored Placement</span>
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-350">Folders compression and protection tools...</span>
          </div>
          <div className="rounded bg-indigo-50 px-2 py-0.5 text-[9px] font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            AdByGoogle
          </div>
        </div>
      </div>
    );
  }

  const containerStyle = {
    'below-hero': 'w-full max-w-7xl mx-auto my-8 p-4 bg-gray-50/55 dark:bg-neutral-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-neutral-800 text-center flex flex-col items-center justify-center min-h-[90px]',
    'sidebar': 'w-full h-[320px] p-6 bg-gray-50/55 dark:bg-neutral-900/30 rounded-2xl border border-dashed border-gray-200 dark:border-neutral-800 text-center flex flex-col items-center justify-center sticky top-24',
    'blog-inline': 'w-full my-6 p-6 bg-gray-50/55 dark:bg-neutral-900/40 rounded-2xl border border-dashed border-gray-200 dark:border-neutral-800 text-center flex flex-col items-center justify-center min-h-[120px]',
    'in-tool': 'w-full my-6 p-4 bg-gray-50/40 dark:bg-neutral-900/20 rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 text-center flex flex-col items-center justify-center min-h-[80px]'
  }[placement];

  return (
    <div className={containerStyle}>
      <div className="flex items-center space-x-2.5 mb-1.5">
        <span className="text-[10px] font-bold tracking-widest text-neutral-400 dark:text-neutral-500 uppercase">
          Advertisement
        </span>
        <span className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.2 rounded font-medium dark:bg-neutral-800 dark:text-neutral-400">
          AdSense Optimized Slot
        </span>
      </div>
      <p className="text-xs text-neutral-500 max-w-lg mb-1">
        Supports free AI cloud computations. Standard banner matches visual aesthetics perfectly.
      </p>
      <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
        Google AdSense Approved Template Placeholders
      </div>
    </div>
  );
}
