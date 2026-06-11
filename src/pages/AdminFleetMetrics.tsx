import { AdminLayout } from "@/components/AdminLayout";
import VehicleMetrics from "@/components/fleet/VehicleMetrics";

export default function AdminFleetMetrics() {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6">
        <VehicleMetrics />
      </div>
    </AdminLayout>
  );
}
