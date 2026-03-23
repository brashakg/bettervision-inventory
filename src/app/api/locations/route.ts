import { NextRequest, NextResponse } from 'next/server';

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  manager: string;
  active: boolean;
}

// Mock locations data
const mockLocations: Location[] = [
  {
    id: 'LOC001',
    name: 'Downtown Store',
    address: '123 Main Street',
    city: 'New York',
    state: 'NY',
    zipCode: '10001',
    phone: '(212) 555-0101',
    manager: 'John Smith',
    active: true,
  },
  {
    id: 'LOC002',
    name: 'Mall Location',
    address: '456 Shopping Center',
    city: 'Los Angeles',
    state: 'CA',
    zipCode: '90001',
    phone: '(213) 555-0202',
    manager: 'Sarah Johnson',
    active: true,
  },
  {
    id: 'LOC003',
    name: 'Airport Store',
    address: '789 Airport Road',
    city: 'Chicago',
    state: 'IL',
    zipCode: '60601',
    phone: '(312) 555-0303',
    manager: 'Michael Davis',
    active: true,
  },
  {
    id: 'LOC004',
    name: 'Fashion District',
    address: '321 Fashion Way',
    city: 'Miami',
    state: 'FL',
    zipCode: '33101',
    phone: '(305) 555-0404',
    manager: 'Emily Wilson',
    active: true,
  },
  {
    id: 'LOC005',
    name: 'Tech Hub',
    address: '654 Innovation Drive',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    phone: '(415) 555-0505',
    manager: 'David Brown',
    active: false,
  },
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const active = searchParams.get('active');

    let locations = mockLocations;

    // Filter by active status if specified
    if (active !== null) {
      const isActive = active === 'true';
      locations = locations.filter(loc => loc.active === isActive);
    }

    return NextResponse.json(locations);
  } catch (error) {
    console.error('Locations fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch locations' },
      { status: 500 }
    );
  }
}
