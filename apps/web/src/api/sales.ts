const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface CreateSaleRequest {
  storeId: string;
  cashierId: string;
  type: string;
  priceLevel: string;
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number; reference?: string }>;
}

export async function createSale(businessId: string, data: CreateSaleRequest) {
  const response = await fetch(`${API_URL}/businesses/${businessId}/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) throw new Error('Failed to create sale');
  return response.json();
}

export async function getSale(businessId: string, saleId: string) {
  const response = await fetch(`${API_URL}/businesses/${businessId}/sales/${saleId}`, {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
  });

  if (!response.ok) throw new Error('Failed to fetch sale');
  return response.json();
}

export async function voidSale(businessId: string, saleId: string, managerId: string, reason: string) {
  const response = await fetch(`${API_URL}/businesses/${businessId}/sales/${saleId}/void`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
    },
    body: JSON.stringify({ managerId, reason }),
  });

  if (!response.ok) throw new Error('Failed to void sale');
  return response.json();
}
