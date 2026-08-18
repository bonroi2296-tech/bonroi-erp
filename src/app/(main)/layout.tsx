import Sidebar from "@/components/Sidebar";
import FeedbackWidget from "@/components/FeedbackWidget";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
      <FeedbackWidget />
    </div>
  );
}
