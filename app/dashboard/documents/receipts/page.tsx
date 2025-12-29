import { getReceiptsListAction } from "./actions";
import ReceiptsListClient from "./ReceiptsListClient";

type PageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: string;
    maxAmount?: string;
    page?: string;
  }>;
};

export default async function ReceiptsListPage({ searchParams }: PageProps) {
  const params = await searchParams;
  
  // Parse filters from URL params
  const filters = {
    search: params.search,
    status: (params.status as any) || "all",
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    minAmount: params.minAmount ? parseFloat(params.minAmount) : undefined,
    maxAmount: params.maxAmount ? parseFloat(params.maxAmount) : undefined,
    page: params.page ? parseInt(params.page) : 1,
    pageSize: 50,
  };

  // Fetch receipts
  const result = await getReceiptsListAction(filters);

  return (
    <div dir="rtl" style={{ padding: 24 }}>
      <ReceiptsListClient initialData={result} initialFilters={filters} />
    </div>
  );
}
