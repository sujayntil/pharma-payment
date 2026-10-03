# Pharma Sales & Collection Management System (Vite React + Tailwind CSS)

Modern, mobile-responsive React application built with **Vite**, **Tailwind CSS v4**, and **Redux Toolkit**, converted from the vanilla frontend.

---

## 🚀 Key Architectural Features

1. **Strict Storage Architecture**:
   - **`localStorage`**: Stores **ONLY** the JWT `token`. No user objects, roles, invoices, or customer data are kept in `localStorage`.
   - **`Redux Toolkit`**: All active application state (user profile, authentication status, invoices, customers, ledgers, MR performance, alerts, and filters) is stored in Redux slices.
   - **Session Rehydration**: On page load, the stored token is validated against expiry and decodes user role and ID directly into Redux.

2. **Authentication & Authorization**:
   - **Role-Based Protected Routes**:
     - `<ProtectedRoute>` ensures only authenticated users can access the application.
     - `<RoleRoute allowedRoles={['ADMIN']}>` restricts admin views to `ADMIN` users.
     - `<RoleRoute allowedRoles={['MR']}>` restricts field representative views to `MR` users.
   - **Automatic Redirects**:
     - Authenticated users visiting `/login` or `/` are redirected to `/admin` or `/mr`.
     - Unauthorized role attempts are automatically redirected to their designated dashboard or `/unauthorized`.
   - **Axios Interceptor**: Automatically attaches `Authorization: Bearer <token>` and handles `401 Unauthorized` responses by purging the token and triggering a Redux logout.

3. **Mobile-Responsive UI with Inline Tailwind CSS**:
   - Touch-friendly horizontal scrollable tabs.
   - Responsive KPI card grids (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
   - Mobile card views on smartphones + comprehensive table views on desktop.
   - Camera capture support for invoice uploads (`capture="environment"`).
   - Bottom-sheet modals on mobile and centered dialogs on desktop.

4. **Configurable Backend API URL via `.env`**:
   - Configure `VITE_API_BASE` in `.env`:
     ```env
     VITE_API_BASE=https://pharma-payment.onrender.com
     ```
   - Change to your local backend (`http://localhost:8000`) or custom domain (e.g. Vercel backend) whenever needed.

---

## 📁 Folder Structure

```
pharma-app/vite-project/
├── .env                        # Environment variables (VITE_API_BASE)
├── .env.example                # Example environment template
├── index.html                  # HTML entry point with IBM Plex typography & meta tags
├── package.json                # Dependencies & build scripts
├── vite.config.js              # Vite + Tailwind v4 + React plugins
└── src/
    ├── api/                    # API client and service endpoints
    │   ├── axiosClient.js      # Axios instance with Bearer interceptor & 401 handling
    │   ├── authApi.js          # Authentication (login)
    │   ├── invoicesApi.js      # Invoices CRUD & AI OCR extraction
    │   ├── paymentsApi.js      # Payment submission
    │   ├── customersApi.js     # Customers and ledger retrieval
    │   ├── adminApi.js         # Admin dashboard, users, alerts, performance
    │   └── mrApi.js            # MR dashboard and outstanding collections
    ├── components/
    │   ├── auth/
    │   │   ├── ProtectedRoute.jsx # Authentication guard
    │   │   └── RoleRoute.jsx      # Role-based authorization guard
    │   └── common/
    │       ├── Topbar.jsx         # App header with branding, user badge & logout
    │       ├── TabNavigation.jsx  # Mobile-responsive horizontal tab navigation
    │       ├── DateFilter.jsx     # Date presets (Today, 5d, Week, Month, Custom)
    │       ├── StatCard.jsx       # KPI card with accent styling and mono digits
    │       ├── StatusPill.jsx     # PAID, PARTIAL, UNPAID badges with dot indicator
    │       ├── Modal.jsx          # Mobile bottom sheet / centered desktop modal
    │       └── EmptyState.jsx     # Clean empty state graphic & message
    ├── hooks/
    │   └── useAppStore.js         # useAppDispatch, useAppSelector, useAuth hooks
    ├── pages/
    │   ├── LoginPage.jsx          # Sign-in card with quick demo login chips
    │   ├── UnauthorizedPage.jsx   # 403 Forbidden page
    │   ├── NotFoundPage.jsx       # 404 Fallback page
    │   ├── admin/
    │   │   ├── AdminLayout.jsx    # Topbar + TabNavigation + view manager
    │   │   ├── AdminDashboard.jsx # Financial totals, counts & >₹50k alerts
    │   │   ├── AdminInvoices.jsx  # Filterable invoices directory with MR filter
    │   │   ├── AdminCustomers.jsx # Customers directory with detailed ledger
    │   │   ├── AdminPerformance.jsx # MR scoreboard and collection rates
    │   │   └── AdminUsers.jsx     # Add user form, directory, edit & delete
    │   └── mr/
    │       ├── MrLayout.jsx       # Topbar + TabNavigation + view manager
    │       ├── MrDashboard.jsx    # Greeting, KPIs & recent invoice entries
    │       ├── MrUploadInvoice.jsx# Camera/file upload, Gemini AI OCR, review & duplicate checks
    │       ├── MrInvoices.jsx     # Invoices list with live search, date filter, edit & delete
    │       └── MrCollections.jsx  # Total outstanding banner & record payment modal
    ├── store/                     # Redux Toolkit State Management
    │   ├── index.js               # Redux store configuration
    │   └── slices/
    │       ├── authSlice.js       # Auth state, login/logout thunks
    │       ├── invoiceSlice.js    # Invoices & AI OCR extraction state
    │       ├── customerSlice.js   # Customers & ledger data
    │       ├── adminSlice.js      # Admin metrics, performance & users
    │       └── mrSlice.js         # MR personal stats & outstanding records
    ├── utils/
    │   └── formatters.js          # Currency formatting (₹), dates, JWT decoding
    ├── App.jsx                    # Route hierarchy & root redirects
    ├── main.jsx                   # Redux Provider, BrowserRouter & React DOM mount
    └── index.css                  # Tailwind CSS imports & theme definitions
```

---

## 🏃 Running the Application

### 1. Install dependencies (if not already installed)
```bash
npm install
```

### 2. Start the Vite dev server
```bash
npm run dev
```

### 3. Production Build
```bash
npm run build
```

### 4. Preview Production Build
```bash
npm run preview
```

---

## 🔑 Demo Credentials
- **Admin**: `ADMIN01` / `admin123`
- **MR (Rahul)**: `MR001` / `mr123`
- **MR (Neha)**: `MR002` / `mr123`
*(Also accessible via one-click chips directly on the login page)*

