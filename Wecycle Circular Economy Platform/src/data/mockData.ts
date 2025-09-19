export const categories = [
  'Wood & Lumber',
  'Metal & Hardware',
  'Fabric & Textiles',
  'Electronics & Components',
  'Glass & Ceramics',
  'Plastic & Polymer',
  'Paper & Cardboard',
  'Stone & Concrete',
  'Tools & Equipment',
  'Furniture & Fixtures',
  'Automotive Parts',
  'Garden & Outdoor',
  'Art & Craft Supplies',
  'Other Materials'
]

export const mockUploads = [
  {
    id: '1',
    title: 'Reclaimed Oak Wood Planks',
    description: 'Beautiful reclaimed oak planks from a 100-year-old barn. Perfect for furniture making or accent walls. Well-maintained with natural patina.',
    category: 'Wood & Lumber',
    location: 'Mumbai, Maharashtra',
    dimensions: '2x6 inches, 8 feet long',
    price: 2500,
    images: ['https://images.unsplash.com/photo-1715534408885-b9e45db5fc13?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZWNsYWltZWQlMjB3b29kJTIwcGxhbmtzfGVufDF8fHx8MTc1NTk0MjM3MXww&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-15T10:00:00Z',
    expires_at: '2024-02-15T10:00:00Z',
    status: 'active',
    user_id: 'demo-user-1',
    user_name: 'Rajesh Kumar',
    max_duration: 31
  },
  {
    id: '2',
    title: 'Vintage Brass Hardware Collection',
    description: 'Antique brass door handles, hinges, and decorative elements. Sourced from heritage building renovation. Great for restoration projects.',
    category: 'Metal & Hardware',
    location: 'Delhi, NCR',
    dimensions: 'Mixed sizes',
    price: 1800,
    images: ['https://images.unsplash.com/photo-1744329630135-06bb9d5e02a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZXRhbCUyMGhhcmR3YXJlJTIwdmludGFnZXxlbnwxfHx8fDE3NTU5NDIzNzZ8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-14T15:30:00Z',
    expires_at: '2024-02-14T15:30:00Z',
    status: 'active',
    user_id: 'demo-user-2',
    user_name: 'Priya Sharma'
  },
  {
    id: '3',
    title: 'Cotton Fabric Remnants - Mixed Colors',
    description: 'High-quality cotton fabric pieces in various colors and patterns. Perfect for quilting, crafts, or small sewing projects. All pieces are clean and in excellent condition.',
    category: 'Fabric & Textiles',
    location: 'Bangalore, Karnataka',
    dimensions: '1-3 yards each',
    price: 800,
    images: ['https://images.unsplash.com/photo-1625471592808-3b848a6e9ffd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYWJyaWMlMjB0ZXh0aWxlJTIwbWF0ZXJpYWxzfGVufDF8fHx8MTc1NTg2NTExNXww&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-13T09:15:00Z',
    expires_at: '2024-01-28T09:15:00Z',
    status: 'active',
    user_id: 'demo-user-3',
    user_name: 'Anita Desai'
  },
  {
    id: '4',
    title: 'Arduino Boards and Electronic Components',
    description: 'Various Arduino boards, sensors, LEDs, and electronic components from completed projects. Perfect for students or hobbyists starting new projects.',
    category: 'Electronics & Components',
    location: 'Pune, Maharashtra',
    dimensions: 'Mixed kit',
    price: 3200,
    images: ['https://images.unsplash.com/photo-1555664424-778a1e5e1b48?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVjdHJvbmljJTIwY29tcG9uZW50c3xlbnwxfHx8fDE3NTU5NDIzODV8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-12T14:45:00Z',
    expires_at: '2024-02-12T14:45:00Z',
    status: 'active',
    user_id: 'demo-user-4',
    user_name: 'Amit Patel'
  },
  {
    id: '5',
    title: 'Ceramic Tiles - Mixed Patterns',
    description: 'Beautiful ceramic tiles from kitchen renovation. Various patterns and colors. Some pieces have minor chips but perfect for mosaic projects.',
    category: 'Glass & Ceramics',
    location: 'Chennai, Tamil Nadu',
    dimensions: '6x6 inches',
    price: 1200,
    images: ['https://images.unsplash.com/photo-1572596116404-98f227c01ac1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXJhbWljJTIwdGlsZXMlMjBicm9rZW58ZW58MXx8fHwxNzU1OTQyMzg5fDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-11T11:20:00Z',
    expires_at: '2024-02-25T11:20:00Z',
    status: 'active',
    user_id: 'demo-user-5',
    user_name: 'Lakshmi Iyer'
  },
  {
    id: '6',
    title: 'Plastic Storage Containers - Various Sizes',
    description: 'Clean plastic containers in different sizes. Food-grade plastic, perfect for organization or storage solutions. All have tight-fitting lids.',
    category: 'Plastic & Polymer',
    location: 'Hyderabad, Telangana',
    dimensions: 'Small to large sizes',
    price: 0, // Free
    images: ['https://images.unsplash.com/photo-1609915437016-85693e56470f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbGFzdGljJTIwY29udGFpbmVyc3xlbnwxfHx8fDE3NTU5NDIzOTN8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-10T16:00:00Z',
    expires_at: '2024-01-31T16:00:00Z',
    status: 'active',
    user_id: 'demo-user-6',
    user_name: 'Vikram Singh'
  },
  {
    id: '7',
    title: 'Cardboard Boxes - Moving Supplies',
    description: 'Sturdy cardboard boxes from recent move. Various sizes, all in excellent condition. Perfect for storage or moving.',
    category: 'Paper & Cardboard',
    location: 'Kolkata, West Bengal',
    dimensions: 'Small, medium, large',
    price: 500,
    images: ['https://images.unsplash.com/photo-1700165644892-3dd6b67b25bc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXJkYm9hcmQlMjBib3hlc3xlbnwxfHx8fDE3NTU5NDIzOTh8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-09T12:30:00Z',
    expires_at: '2024-02-09T12:30:00Z',
    status: 'active',
    user_id: 'demo-user-7',
    user_name: 'Sneha Roy'
  },
  {
    id: '8',
    title: 'Garden Tools Set',
    description: 'Well-maintained gardening tools including spades, pruning shears, and hand tools. Perfect for home gardening enthusiasts.',
    category: 'Tools & Equipment',
    location: 'Ahmedabad, Gujarat',
    dimensions: 'Standard sizes',
    price: 1500,
    images: ['https://images.unsplash.com/photo-1601312540057-7234a01baef6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYXJkZW4lMjB0b29sc3xlbnwxfHx8fDE3NTU5NDI0MDJ8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-08T14:15:00Z',
    expires_at: '2024-02-08T14:15:00Z',
    status: 'active',
    user_id: 'demo-user-8',
    user_name: 'Kiran Patel'
  },
  {
    id: '9',
    title: 'Wooden Furniture Parts - Table Legs',
    description: 'Solid wood table legs from a dining set. Beautiful craftsmanship, can be repurposed for new furniture projects.',
    category: 'Furniture & Fixtures',
    location: 'Jaipur, Rajasthan',
    dimensions: '28 inches height',
    price: 2000,
    images: ['https://images.unsplash.com/photo-1487015307662-6ce6210680f1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b29kZW4lMjBmdXJuaXR1cmV8ZW58MXx8fHwxNzU1OTQyNDA2fDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-07T09:45:00Z',
    expires_at: '2024-02-07T09:45:00Z',
    status: 'active',
    user_id: 'demo-user-9',
    user_name: 'Deepak Sharma'
  },
  {
    id: '10',
    title: 'Car Parts - Headlights and Mirrors',
    description: 'Used car parts in good condition. Headlight assemblies and side mirrors from a Maruti Swift. Working condition.',
    category: 'Automotive Parts',
    location: 'Gurgaon, Haryana',
    dimensions: 'Car specific',
    price: 3500,
    images: ['https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwcGFydHN8ZW58MXx8fHwxNzU1OTQyNDEwfDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-06T16:20:00Z',
    expires_at: '2024-02-06T16:20:00Z',
    status: 'active',
    user_id: 'demo-user-10',
    user_name: 'Arjun Mehra'
  },
  // Additional 15 items for better testing
  {
    id: '11',
    title: 'Bamboo Panels for Interior Design',
    description: 'Sustainable bamboo panels, perfect for eco-friendly interior projects. Lightweight yet sturdy construction.',
    category: 'Wood & Lumber',
    location: 'Cochin, Kerala',
    dimensions: '4x8 feet',
    price: 1800,
    images: ['https://images.unsplash.com/photo-1715534408885-b9e45db5fc13?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZWNsYWltZWQlMjB3b29kJTIwcGxhbmtzfGVufDF8fHx8MTc1NTk0MjM3MXww&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-05T11:30:00Z',
    expires_at: '2024-02-05T11:30:00Z',
    status: 'active',
    user_id: 'demo-user-11',
    user_name: 'Maya Nair'
  },
  {
    id: '12',
    title: 'Copper Pipes and Fittings',
    description: 'High-grade copper pipes with various fittings. Suitable for plumbing projects. No corrosion or damage.',
    category: 'Metal & Hardware',
    location: 'Lucknow, Uttar Pradesh',
    dimensions: '1/2 inch to 1 inch diameter',
    price: 2200,
    images: ['https://images.unsplash.com/photo-1744329630135-06bb9d5e02a0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZXRhbCUyMGhhcmR3YXJlJTIwdmludGFnZXxlbnwxfHx8fDE3NTU5NDIzNzZ8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-04T13:45:00Z',
    expires_at: '2024-02-04T13:45:00Z',
    status: 'active',
    user_id: 'demo-user-12',
    user_name: 'Rohit Verma'
  },
  {
    id: '13',
    title: 'Denim Fabric Scraps - Upcycling Material',
    description: 'High-quality denim fabric pieces from a clothing manufacturer. Perfect for upcycling projects, bags, or patches.',
    category: 'Fabric & Textiles',
    location: 'Tirupur, Tamil Nadu',
    dimensions: 'Various sizes',
    price: 600,
    images: ['https://images.unsplash.com/photo-1625471592808-3b848a6e9ffd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYWJyaWMlMjB0ZXh0aWxlJTIwbWF0ZXJpYWxzfGVufDF8fHx8MTc1NTg2NTExNXww&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-03T10:15:00Z',
    expires_at: '2024-02-03T10:15:00Z',
    status: 'active',
    user_id: 'demo-user-13',
    user_name: 'Kavya Reddy'
  },
  {
    id: '14',
    title: 'Raspberry Pi Collection with Accessories',
    description: 'Multiple Raspberry Pi boards with sensors, cases, and accessories. Great for IoT and electronics projects.',
    category: 'Electronics & Components',
    location: 'Mysore, Karnataka',
    dimensions: 'Complete kit',
    price: 4500,
    images: ['https://images.unsplash.com/photo-1555664424-778a1e5e1b48?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVjdHJvbmljJTIwY29tcG9uZW50c3xlbnwxfHx8fDE3NTU5NDIzODV8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-02T15:20:00Z',
    expires_at: '2024-02-02T15:20:00Z',
    status: 'active',
    user_id: 'demo-user-14',
    user_name: 'Siddharth Rao'
  },
  {
    id: '15',
    title: 'Glass Bottles and Jars - Craft Supplies',
    description: 'Clean glass bottles and jars in various shapes and sizes. Perfect for DIY projects, storage, or decoration.',
    category: 'Glass & Ceramics',
    location: 'Indore, Madhya Pradesh',
    dimensions: 'Mixed sizes',
    price: 0,
    images: ['https://images.unsplash.com/photo-1572596116404-98f227c01ac1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXJhbWljJTIwdGlsZXMlMjBicm9rZW58ZW58MXx8fHwxNzU1OTQyMzg5fDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2024-01-01T08:00:00Z',
    expires_at: '2024-02-01T08:00:00Z',
    status: 'active',
    user_id: 'demo-user-15',
    user_name: 'Neha Agarwal'
  },
  {
    id: '16',
    title: 'PVC Pipes and Connectors',
    description: 'White PVC pipes with various connectors and joints. Suitable for plumbing or creative construction projects.',
    category: 'Plastic & Polymer',
    location: 'Surat, Gujarat',
    dimensions: '2-4 inch diameter',
    price: 800,
    images: ['https://images.unsplash.com/photo-1609915437016-85693e56470f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbGFzdGljJTIwY29udGFpbmVyc3xlbnwxfHx8fDE3NTU5NDIzOTN8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-31T14:30:00Z',
    expires_at: '2024-01-31T14:30:00Z',
    status: 'active',
    user_id: 'demo-user-16',
    user_name: 'Harsh Patel'
  },
  {
    id: '17',
    title: 'Art Paper and Sketchbooks',
    description: 'High-quality art paper, sketchbooks, and drawing materials. Some lightly used, perfect for artists and students.',
    category: 'Paper & Cardboard',
    location: 'Vadodara, Gujarat',
    dimensions: 'A4, A3 sizes',
    price: 400,
    images: ['https://images.unsplash.com/photo-1700165644892-3dd6b67b25bc?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYXJkYm9hcmQlMjBib3hlc3xlbnwxfHx8fDE3NTU5NDIzOTh8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-30T09:45:00Z',
    expires_at: '2024-01-30T09:45:00Z',
    status: 'active',
    user_id: 'demo-user-17',
    user_name: 'Ishita Shah'
  },
  {
    id: '18',
    title: 'Granite Slabs - Kitchen Renovation',
    description: 'Beautiful granite slabs from kitchen renovation. Polished surface, some pieces have cutouts for sinks.',
    category: 'Stone & Concrete',
    location: 'Coimbatore, Tamil Nadu',
    dimensions: '2x4 feet',
    price: 3000,
    images: ['https://images.unsplash.com/photo-1572596116404-98f227c01ac1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXJhbWljJTIwdGlsZXMlMjBicm9rZW58ZW58MXx8fHwxNzU1OTQyMzg5fDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-29T16:10:00Z',
    expires_at: '2024-01-29T16:10:00Z',
    status: 'active',
    user_id: 'demo-user-18',
    user_name: 'Murugan Krishnan'
  },
  {
    id: '19',
    title: 'Power Tools - Drill and Accessories',
    description: 'Electric drill with various bits and accessories. Good working condition, perfect for home improvement projects.',
    category: 'Tools & Equipment',
    location: 'Nagpur, Maharashtra',
    dimensions: 'Portable',
    price: 2800,
    images: ['https://images.unsplash.com/photo-1601312540057-7234a01baef6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYXJkZW4lMjB0b29sc3xlbnwxfHx8fDE3NTU5NDI0MDJ8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-28T12:25:00Z',
    expires_at: '2024-01-28T12:25:00Z',
    status: 'active',
    user_id: 'demo-user-19',
    user_name: 'Ajay Thakur'
  },
  {
    id: '20',
    title: 'Office Furniture - Desk Drawers',
    description: 'Wooden desk drawers and storage units from office renovation. Solid construction, perfect for home office setup.',
    category: 'Furniture & Fixtures',
    location: 'Noida, Uttar Pradesh',
    dimensions: 'Standard desk size',
    price: 1200,
    images: ['https://images.unsplash.com/photo-1487015307662-6ce6210680f1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3b29kZW4lMjBmdXJuaXR1cmV8ZW58MXx8fHwxNzU1OTQyNDA2fDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-27T11:40:00Z',
    expires_at: '2024-01-27T11:40:00Z',
    status: 'active',
    user_id: 'demo-user-20',
    user_name: 'Pooja Singh'
  },
  {
    id: '21',
    title: 'Motorcycle Parts - Fairings and Panels',
    description: 'Motorcycle body parts including fairings and side panels. Good condition, suitable for restoration projects.',
    category: 'Automotive Parts',
    location: 'Vijayawada, Andhra Pradesh',
    dimensions: 'Bike specific',
    price: 4200,
    images: ['https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwcGFydHN8ZW58MXx8fHwxNzU1OTQyNDEwfDA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-26T14:55:00Z',
    expires_at: '2024-01-26T14:55:00Z',
    status: 'active',
    user_id: 'demo-user-21',
    user_name: 'Rakesh Reddy'
  },
  {
    id: '22',
    title: 'Plant Pots and Garden Containers',
    description: 'Terracotta and plastic plant pots in various sizes. Some with drainage holes, perfect for indoor and outdoor gardening.',
    category: 'Garden & Outdoor',
    location: 'Chandigarh, Punjab',
    dimensions: '6-12 inch diameter',
    price: 300,
    images: ['https://images.unsplash.com/photo-1601312540057-7234a01baef6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnYXJkZW4lMjB0b29sc3xlbnwxfHx8fDE3NTU5NDI0MDJ8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-25T10:20:00Z',
    expires_at: '2024-01-25T10:20:00Z',
    status: 'active',
    user_id: 'demo-user-22',
    user_name: 'Simran Kaur'
  },
  {
    id: '23',
    title: 'Acrylic Paints and Art Supplies',
    description: 'Professional acrylic paints, brushes, and canvas boards. Lightly used art supplies from a completed project.',
    category: 'Art & Craft Supplies',
    location: 'Bhopal, Madhya Pradesh',
    dimensions: 'Art supplies set',
    price: 1500,
    images: ['https://images.unsplash.com/photo-1625471592808-3b848a6e9ffd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmYWJyaWMlMjB0ZXh0aWxlJTIwbWF0ZXJpYWxzfGVufDF8fHx8MTc1NTg2NTExNXww&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-24T13:35:00Z',
    expires_at: '2024-01-24T13:35:00Z',
    status: 'active',
    user_id: 'demo-user-23',
    user_name: 'Aadhya Jain'
  },
  {
    id: '24',
    title: 'Rubber Mats and Industrial Materials',
    description: 'Heavy-duty rubber mats and gaskets. Suitable for industrial applications or workshop flooring.',
    category: 'Other Materials',
    location: 'Kanpur, Uttar Pradesh',
    dimensions: '4x6 feet',
    price: 900,
    images: ['https://images.unsplash.com/photo-1609915437016-85693e56470f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbGFzdGljJTIwY29udGFpbmVyc3xlbnwxfHx8fDE3NTU5NDIzOTN8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-23T15:50:00Z',
    expires_at: '2024-01-23T15:50:00Z',
    status: 'active',
    user_id: 'demo-user-24',
    user_name: 'Gaurav Mishra'
  },
  {
    id: '25',
    title: 'LED Strips and Lighting Components',
    description: 'RGB LED strips with controllers and accessories. Perfect for ambient lighting projects or room decoration.',
    category: 'Electronics & Components',
    location: 'Faridabad, Haryana',
    dimensions: '5-meter strips',
    price: 1100,
    images: ['https://images.unsplash.com/photo-1555664424-778a1e5e1b48?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVjdHJvbmljJTIwY29tcG9uZW50c3xlbnwxfHx8fDE3NTU5NDIzODV8MA&ixlib=rb-4.1.0&q=80&w=1080'],
    created_at: '2023-12-22T09:15:00Z',
    expires_at: '2024-01-22T09:15:00Z',
    status: 'active',
    user_id: 'demo-user-25',
    user_name: 'Tanvi Sharma'
  }
]

export const mockRequests = [
  {
    id: 'req-1',
    title: 'Looking for Teak Wood for Furniture Project',
    description: 'Need good quality teak wood pieces for making a dining table. Preferably seasoned wood. Can pick up from anywhere in Mumbai metropolitan area.',
    category: 'Wood & Lumber',
    location: 'Mumbai, Maharashtra',
    reference_image: 'https://images.unsplash.com/photo-1715534408885-b9e45db5fc13?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyZWNsYWltZWQlMjB3b29kJTIwcGxhbmtzfGVufDF8fHx8MTc1NTk0MjM3MXww&ixlib=rb-4.1.0&q=80&w=1080',
    notes: 'Flexible on dimensions, quality is more important',
    created_at: '2024-01-14T08:30:00Z',
    expires_at: '2024-02-14T08:30:00Z',
    status: 'active',
    user_id: 'demo-user-req-1',
    user_name: 'Suresh Menon'
  },
  {
    id: 'req-2', 
    title: 'Copper Pipes for Plumbing Project',
    description: 'Looking for copper pipes of various sizes for a home renovation project. Condition should be good without major dents or corrosion.',
    category: 'Metal & Hardware',
    location: 'Delhi, NCR',
    reference_image: null,
    notes: 'Need approximately 50 feet total length',
    created_at: '2024-01-13T12:15:00Z',
    expires_at: '2024-02-05T12:15:00Z',
    status: 'active',
    user_id: 'demo-user-req-2',
    user_name: 'Meera Gupta'
  },
  {
    id: 'req-3',
    title: 'Old Newspapers for Art Project',
    description: 'Art teacher looking for old newspapers for student papier-mâché projects. Any quantity welcome. Can collect from multiple locations.',
    category: 'Paper & Cardboard',
    location: 'Bangalore, Karnataka',
    reference_image: null,
    notes: 'School project - any quantity helps!',
    created_at: '2024-01-12T14:20:00Z',
    expires_at: '2024-01-30T14:20:00Z',
    status: 'active',
    user_id: 'demo-user-req-3',
    user_name: 'Kavitha Reddy'
  },
  {
    id: 'req-4',
    title: 'Ceramic Tiles for Garden Pathway',
    description: 'Looking for ceramic tiles to create a garden pathway. Mixed colors and patterns welcome. Broken tiles are okay for mosaic effect.',
    category: 'Glass & Ceramics',
    location: 'Hyderabad, Telangana',
    reference_image: 'https://images.unsplash.com/photo-1572596116404-98f227c01ac1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXJhbWljJTIwdGlsZXMlMjBicm9rZW58ZW58MXx8fHwxNzU1OTQyMzg5fDA&ixlib=rb-4.1.0&q=80&w=1080',
    notes: 'Creative project - imperfect tiles are fine',
    created_at: '2024-01-11T10:45:00Z',
    expires_at: '2024-02-11T10:45:00Z',
    status: 'active',
    user_id: 'demo-user-req-4',
    user_name: 'Ravi Kumar'
  },
  {
    id: 'req-5',
    title: 'Electronics Components for IoT Project',
    description: 'Student looking for Arduino boards, sensors, and breadboards for final year project. Budget is limited.',
    category: 'Electronics & Components',
    location: 'Pune, Maharashtra',
    reference_image: null,
    notes: 'Student project - any working components appreciated',
    created_at: '2024-01-10T16:30:00Z',
    expires_at: '2024-02-10T16:30:00Z',
    status: 'active',
    user_id: 'demo-user-req-5',
    user_name: 'Aniket Kulkarni'
  },
  {
    id: 'req-6',
    title: 'Fabric Scraps for Quilting',
    description: 'Quilting enthusiast looking for cotton fabric pieces. Any colors welcome. Looking to create a community quilt.',
    category: 'Fabric & Textiles',
    location: 'Chennai, Tamil Nadu',
    reference_image: null,
    notes: 'Community project - all donations welcome',
    created_at: '2024-01-09T11:45:00Z',
    expires_at: '2024-02-09T11:45:00Z',
    status: 'active',
    user_id: 'demo-user-req-6',
    user_name: 'Preethi Lakshmi'
  }
]

export const mockProfiles = [
  {
    id: 'demo-user-1',
    name: 'Rajesh Kumar',
    email: 'rajesh@example.com',
    location: 'Mumbai, Maharashtra',
    bio: 'Furniture maker and woodworking enthusiast. Passionate about upcycling and sustainable crafts.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'demo-user-2', 
    name: 'Priya Sharma',
    email: 'priya@example.com',
    location: 'Delhi, NCR',
    bio: 'Interior designer with a love for vintage and antique elements.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'demo-user-3',
    name: 'Anita Desai',
    email: 'anita@example.com', 
    location: 'Bangalore, Karnataka',
    bio: 'Textile artist and sustainable fashion advocate.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'demo-user-4',
    name: 'Amit Patel',
    email: 'amit@example.com',
    location: 'Pune, Maharashtra', 
    bio: 'Electronics engineer and maker space enthusiast.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'demo-user-5',
    name: 'Lakshmi Iyer',
    email: 'lakshmi@example.com',
    location: 'Chennai, Tamil Nadu',
    bio: 'Architect specializing in heritage restoration projects.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'demo-user-6',
    name: 'Vikram Singh',
    email: 'vikram@example.com',
    location: 'Jaipur, Rajasthan',
    bio: 'Building contractor committed to sustainable construction practices.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  // Additional profiles for new items
  {
    id: 'demo-user-7',
    name: 'Sneha Roy',
    email: 'sneha@example.com',
    location: 'Kolkata, West Bengal',
    bio: 'Graphic designer and eco-friendly packaging specialist.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'demo-user-8',
    name: 'Kiran Patel',
    email: 'kiran@example.com',
    location: 'Ahmedabad, Gujarat',
    bio: 'Urban gardener and sustainable living advocate.',
    avatar_url: null,
    created_at: '2024-01-01T00:00:00Z'
  }
]

export const mockNotifications = [
  {
    id: 'notif-1',
    user_id: 'demo-user-1',
    type: 'saved_item_removed',
    title: 'Saved item no longer available',
    message: 'The Arduino Boards and Electronic Components you saved has been removed',
    is_read: false,
    created_at: '2024-01-15T14:30:00Z',
    related_id: '4'
  },
  {
    id: 'notif-2',
    user_id: 'demo-user-1', 
    type: 'request_response',
    title: 'New response to your request',
    message: 'Someone responded to your "Looking for Teak Wood" request',
    is_read: false,
    created_at: '2024-01-15T12:15:00Z',
    related_id: 'req-1'
  }
]

// Helper function to find similar items based on category and description
export const findSimilarItems = (searchQuery: string, category?: string, limit = 3) => {
  let filtered = mockUploads.filter(item => item.status === 'active')
  
  if (category) {
    filtered = filtered.filter(item => item.category === category)
  }
  
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(item => 
      item.title.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    )
  }
  
  return filtered.slice(0, limit)
}