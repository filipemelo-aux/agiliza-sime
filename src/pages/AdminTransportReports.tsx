import { AdminLayout } from "@/components/AdminLayout";
import { TransportReports } from "@/components/transport/TransportReports";

export default function AdminTransportReports() {
  return (
    <AdminLayout>
      <div className="px-4 py-3 md:px-6">
        <TransportReports />
      </div>
    </AdminLayout>
  );
}
