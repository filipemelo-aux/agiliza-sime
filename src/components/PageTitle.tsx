export function PageTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={`text-2xl font-bold font-display leading-tight mb-4 ${className}`}>{children}</h1>
  );
}
