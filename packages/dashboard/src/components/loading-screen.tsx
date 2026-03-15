/**
 * Full-screen loading overlay with orbital spinner around the app icon.
 */
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background animate-in fade-in duration-300">
      {/* Logo with orbital spinner */}
      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex h-72 w-72 items-center justify-center rounded-full bg-secondary dark:bg-[#171717] ring-1 ring-border overflow-hidden p-6">
          <span className="text-4xl font-bold text-foreground">bat</span>
        </div>
        {/* Orbital spinner — overlays the circle edge */}
        <div className="absolute inset-[-4px] rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
      </div>
    </div>
  );
}
