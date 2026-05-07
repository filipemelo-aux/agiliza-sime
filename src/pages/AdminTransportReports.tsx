import { AdminLayout } from "@/components/AdminLayout";
import { TransportReports } from "@/components/transport/TransportReports";

export default function AdminTransportReports() {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6">
        <TransportReports />
      </div>
    </AdminLayout>
  );
}
