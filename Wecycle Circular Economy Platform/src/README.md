# 🌱 Wecycle - Circular Economy Platform

A modern, full-stack web application that connects communities through material sharing and reuse, built with React, TypeScript, Tailwind CSS, and Supabase.

![Wecycle Platform](https://via.placeholder.com/800x400/22c55e/ffffff?text=Wecycle%20-%20Sustainable%20Material%20Sharing)

## ✨ Features

### 🔐 **Authentication & User Management**
- Secure user registration and login with Supabase Auth
- Profile management with avatar uploads and custom bio
- Email verification and password recovery
- Protected routes and session management

### 📦 **Material Distribution**
- Upload materials with multiple image support
- Rich descriptions with dimensions and pricing
- Location-based discovery and categorization  
- Automatic expiration with countdown timers
- Status tracking (active, acquired, lapsed)

### 🔍 **Request System**
- Post detailed material requests with reference images
- Community response system with messaging
- Time-limited requests with visual countdowns
- Smart matching suggestions based on location/category

### 💾 **Inventory Management**
- Comprehensive dashboard for user materials
- Track uploads, requests, and saved items
- Bulk status updates and filtering
- Activity history and statistics

### 🔔 **Real-time Notifications**
- Live notifications for saved item changes
- Request responses and material acquisitions
- Real-time updates via Supabase subscriptions
- Toast notifications for immediate feedback

### 📱 **Modern UI/UX**
- Fully responsive design for all devices
- Clean, accessibility-first interface
- Green sustainability theme with smooth animations
- Loading states and error boundaries
- Offline-ready fallbacks

## 🚀 Demo Mode

The app includes a comprehensive demo mode that showcases all features without requiring a Supabase setup:

- **Interactive Demo Data**: Browse realistic materials and requests
- **Simulated User Flow**: Experience the complete user journey
- **Setup Integration**: Easy transition to production with guided setup
- **Full Feature Preview**: Test all functionality before deployment

## 🛠 Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Real-time)
- **UI Framework**: shadcn/ui component system
- **Icons**: Lucide React
- **Image Handling**: Supabase Storage with progressive loading
- **State Management**: React Context + Custom Hooks
- **Deployment**: Vercel/Netlify ready

## 📋 Quick Start

### Option 1: Demo Mode (Instant Setup)

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/wecycle.git
   cd wecycle
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm start
   ```

The app will run in demo mode, showcasing all features with mock data.

### Option 2: Full Production Setup

For complete functionality with real users and data storage:

1. **Create Supabase Project**
   - Visit [supabase.com](https://supabase.com) and create a new project
   - Note your Project URL and anon key from Settings → API

2. **Configure Database**
   - Go to SQL Editor in Supabase Dashboard
   - Run the complete schema from `/supabase/schema_sql.tsx`

3. **Setup Storage**
   - Create an `images` bucket in Supabase Storage
   - Enable public access for image uploads

4. **Update Configuration**
   ```typescript
   // In /lib/supabase.ts
   const supabaseUrl = 'YOUR_SUPABASE_PROJECT_URL'
   const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'
   ```

5. **Deploy**
   - Push to GitHub and connect to Vercel/Netlify
   - Your app is live with full functionality!

## 📁 Project Structure

```
wecycle/
├── components/               # React components
│   ├── ui/                  # shadcn/ui component library
│   ├── Auth.tsx             # Authentication flows
│   ├── HomeFeed.tsx         # Main materials feed
│   ├── DemoHomeFeed.tsx     # Demo mode feed
│   ├── DistributeForm.tsx   # Material upload form
│   ├── RequestForm.tsx      # Request creation form
│   ├── Inventory.tsx        # User inventory dashboard
│   ├── Notifications.tsx    # Notification center
│   └── Profile.tsx          # User profile management
├── services/                # API service layer
│   ├── uploadService.ts     # Material management
│   ├── requestService.ts    # Request operations
│   ├── notificationService.ts # Notifications & saved items
│   └── profileService.ts    # User profile operations
├── hooks/                   # Custom React hooks
│   └── useAuth.tsx          # Authentication hook
├── lib/                     # Core utilities
│   └── supabase.ts          # Supabase client & config
├── data/                    # Mock data for demo mode
├── types/                   # TypeScript definitions
└── styles/                  # Global styles & Tailwind config
```

## 🔧 Configuration

### Environment Variables (Optional)

For advanced deployments, you can use environment variables:

```bash
# .env.local
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
```

### Supabase Setup

The application includes comprehensive database schema with:

- **Row Level Security (RLS)** for data protection
- **Automated profile creation** on user signup  
- **Real-time subscriptions** for live updates
- **Optimized indexes** for fast queries
- **Trigger-based notifications** for user actions

## 🚀 Deployment

### Vercel (Recommended)

1. **Connect Repository**
   ```bash
   # Push to GitHub
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Visit [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Add environment variables (if using)
   - Deploy automatically

### Netlify

1. **Build Configuration**
   ```toml
   # netlify.toml
   [build]
     command = "npm run build"
     publish = "build"
   ```

2. **Deploy**
   - Connect your GitHub repo to Netlify
   - Configure build settings
   - Deploy with auto-deployments enabled

### AWS Amplify

1. **Connect Repository**
   - Use AWS Amplify console
   - Connect your GitHub repository
   - Configure build settings automatically

## 🔒 Security Features

- **Row Level Security** on all database tables
- **Authentication required** for data modifications
- **Input sanitization** and validation
- **Secure file uploads** with type checking
- **CSRF protection** via Supabase Auth
- **SQL injection protection** through parameterized queries

## 🌟 Key Features Deep Dive

### Real-time System
- **Live Updates**: Materials and requests update instantly across all users
- **Push Notifications**: Immediate alerts for user actions
- **Optimistic Updates**: Instant UI feedback while syncing with server

### Search & Discovery
- **Location-based Filtering**: Find materials near you
- **Category Organization**: Structured browsing experience
- **Smart Recommendations**: Suggest relevant items based on user behavior

### Community Features
- **User Profiles**: Build trust through complete profiles
- **Response System**: Direct communication for material requests
- **Reputation Building**: Track successful transactions and contributions

## 📊 Performance Optimizations

- **Lazy Loading**: Components load on demand
- **Image Optimization**: Progressive loading with fallbacks
- **Database Indexing**: Optimized queries for fast response times
- **Caching Strategy**: Smart caching for frequently accessed data
- **Bundle Optimization**: Tree shaking and code splitting

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on:

- Code standards and formatting
- Pull request process
- Issue reporting
- Feature requests

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

**Getting Started Issues?**
- Check the [Setup Guide](SETUP.md) for detailed instructions
- Verify Supabase configuration in the dashboard
- Ensure all environment variables are correctly set

**Feature Requests & Bugs**
- Open an issue on GitHub with detailed description
- Include browser version and error messages
- Provide steps to reproduce any bugs

**Community**
- Join our Discord server for real-time help
- Follow updates on Twitter [@WecycleApp](https://twitter.com/wecycleapp)
- Star the repository to support the project!

---

**🌍 Building a Sustainable Future Through Community Sharing**

Wecycle empowers communities to reduce waste, share resources, and build stronger connections through material reuse. Every shared item contributes to a more sustainable world! ♻️

![Sustainability Badges](https://img.shields.io/badge/Sustainable-Community-green) ![Open Source](https://img.shields.io/badge/Open-Source-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-Ready-lightblue)