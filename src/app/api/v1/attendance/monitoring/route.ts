import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { auth } from "@/auth";
import { getLiveMonitoringStats, getLiveGateFeed } from "@/lib/attendance/monitoring-service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return apiError("AUTH_003", "Authentication required. Please sign in.", undefined, 401);
  }

  const userRole = (session.user as any).role;
  // Correction #4: Explicitly block 'employee' role from monitoring endpoint
  if (userRole === "employee") {
    return apiError("AUTH_004", "Forbidden. Employee role cannot access live gate monitoring.", undefined, 403);
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || undefined;
  const limit = parseInt(searchParams.get("limit") || "30", 10);

  try {
    const stats = await getLiveMonitoringStats(date);
    const feed = await getLiveGateFeed(limit);

    return apiSuccess({ stats, feed });
  } catch (error: any) {
    console.error("MONITORING_ERROR:", error);
    return apiError("SYS_002", "Failed to retrieve monitoring feed.", undefined, 500);
  }
}
