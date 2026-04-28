import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Users, 
  CreditCard, 
  TrendingUp, 
  Search, 
  LogOut, 
  LogIn,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Filter,
  Edit2,
  Trash2,
  Download
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  increment,
  where,
  limit,
  Timestamp,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from 'recharts';

import { db, auth, signInWithGoogle } from './lib/firebase';
import { cn } from './lib/utils';
import { Customer, SaleRecord, SaleItem, OperationType, FirestoreErrorInfo, ActivityType, ACTIVITY_POINTS, TopUpRecord, TariffType } from './types';
import { addDays } from 'date-fns';

// Error Handler
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Components
const StatCard = ({ title, value, icon: Icon, trend, color }: any) => (
  <div className="bg-white p-5 rounded-sm shadow-sm border border-slate-200 flex items-center justify-between">
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
      <h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3>
      {trend && (
        <p className={cn("text-xs mt-2 flex items-center gap-1", trend > 0 ? "text-emerald-600" : "text-rose-600")}>
          {trend > 0 ? "+" : ""}{trend}% from last month
        </p>
      )}
    </div>
    <div className={cn("p-3 rounded-sm", color)}>
      <Icon className="w-5 h-5 text-white" />
    </div>
  </div>
);

const TransactionStatus = ({ status }: { status: SaleRecord['status'] }) => {
  switch (status) {
    case 'success':
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase rounded-full border border-emerald-100">Success</span>;
    case 'pending':
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase rounded-full border border-amber-100">Pending</span>;
    case 'failed':
      return <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase rounded-full border border-red-100">Failed</span>;
    default:
      return null;
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [topups, setTopups] = useState<TopUpRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'topups'>('overview');
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Form states
  const [newTopUp, setNewTopUp] = useState<{
    customerId: string;
    agentName: string;
    customerName: string;
    topUpNumber: string;
    contact: string;
    tariff: TariffType;
    amount: string;
    renewDate: string;
    period: string;
    paymentMethod: string;
  }>({ 
    customerId: '', 
    agentName: '',
    customerName: '',
    topUpNumber: '',
    contact: '',
    tariff: 'Smart@Home',
    amount: '', 
    renewDate: format(new Date(), 'yyyy-MM-dd'),
    period: '1',
    paymentMethod: 'Credit Card'
  });
  
  const [newSale, setNewSale] = useState<{
    agentName: string;
    customerPhone: string;
    items: { activityType: ActivityType; value: string; points: string }[];
    date: string;
  }>({
    agentName: '',
    customerPhone: '',
    items: [{ activityType: 'Prepaid GA', value: '', points: '' }],
    date: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setNewSale(prev => ({ ...prev, agentName: u.displayName || '', date: format(new Date(), 'yyyy-MM-dd') }));
        setNewTopUp(prev => ({ ...prev, agentName: u.displayName || '' }));
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    const customersQuery = query(collection(db, 'customers'), orderBy('updatedAt', 'desc'));
    const salesQuery = query(
      collection(db, 'sales'), 
      where('agentName', '==', user.displayName || ''),
      orderBy('timestamp', 'desc'), 
      limit(50)
    );
    const topupsQuery = query(
      collection(db, 'topups'), 
      where('agentName', '==', user.displayName || ''),
      orderBy('timestamp', 'desc'), 
      limit(50)
    );

    const unsubCustomers = onSnapshot(customersQuery, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'customers'));

    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleRecord)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'sales'));

    const unsubTopups = onSnapshot(topupsQuery, (snapshot) => {
      setTopups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TopUpRecord)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'topups'));

    return () => {
      unsubCustomers();
      unsubSales();
      unsubTopups();
    };
  }, [user]);

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const processedItems: SaleItem[] = newSale.items.map(item => {
        const value = parseFloat(item.value) || 0;
        const points = parseFloat(item.points) || 0;
        
        return {
          activityType: item.activityType,
          value: value,
          points: points
        };
      });

      const totalAmount = processedItems.reduce((sum, item) => sum + item.value, 0);
      const totalPoints = processedItems.reduce((sum, item) => sum + item.points, 0);

      const saleDate = new Date(newSale.date);
      // Set to current time but with selected date
      const now = new Date();
      saleDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

      if (editingSaleId) {
        await updateDoc(doc(db, 'sales', editingSaleId), {
          agentName: user.displayName || 'Unknown Agent',
          customerPhone: newSale.customerPhone,
          items: processedItems,
          totalAmount: totalAmount,
          totalPoints: totalPoints,
          timestamp: Timestamp.fromDate(saleDate),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'sales'), {
          agentName: user.displayName || 'Unknown Agent',
          customerPhone: newSale.customerPhone,
          items: processedItems,
          totalAmount: totalAmount,
          totalPoints: totalPoints,
          status: 'success',
          timestamp: Timestamp.fromDate(saleDate),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      setIsSaleModalOpen(false);
      setEditingSaleId(null);
      setNewSale({
        agentName: user?.displayName || '',
        customerPhone: '',
        items: [{ activityType: 'Prepaid GA', value: '', points: '' }],
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } catch (err) {
      handleFirestoreError(err, editingSaleId ? OperationType.UPDATE : OperationType.CREATE, editingSaleId ? `sales/${editingSaleId}` : 'sales');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSale = (sale: any) => {
    setEditingSaleId(sale.id);
    setNewSale({
      agentName: sale.agentName,
      customerPhone: sale.customerPhone,
      items: sale.items.map((item: any) => ({
        activityType: item.activityType,
        value: item.value.toString(),
        points: item.points.toString()
      })),
      date: format(sale.timestamp?.toDate() || new Date(), 'yyyy-MM-dd')
    });
    setIsSaleModalOpen(true);
  };

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    
    const amount = parseFloat(newTopUp.amount);
    const period = parseInt(newTopUp.period) || 0;
    const totalDays = period * 30;
    
    if (isNaN(amount)) return;

    setSubmitting(true);
    const renewDateObj = new Date(newTopUp.renewDate);
    const expiryDateObj = addDays(renewDateObj, totalDays);

    try {
      // Points calculation for TopUp based on user request:
      // Home Internet New, recharge = x2
      // Regular Recharge = x1 (Prepaid GA, Recharge)
      let pointsMultiplier = 1.0;
      if (newTopUp.tariff.toLowerCase().includes('home internet')) {
        pointsMultiplier = 2.0;
      }

      const totalPoints = amount * pointsMultiplier;

      // Create a topup record
      const topUpDoc = await addDoc(collection(db, 'topups'), {
        customerId: newTopUp.customerId || 'walk-in',
        agentName: user.displayName || 'Unknown Agent',
        customerName: newTopUp.customerName,
        topUpNumber: newTopUp.topUpNumber,
        contact: newTopUp.contact,
        tariff: newTopUp.tariff,
        amount: amount,
        points: totalPoints,
        renewDate: Timestamp.fromDate(renewDateObj),
        period: period,
        expiryDate: Timestamp.fromDate(expiryDateObj),
        status: 'success',
        paymentMethod: newTopUp.paymentMethod,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // After topup doc is created, run linked writes in parallel
      const linkedPromises = [];
      
      // Also create a sale record for financial reporting, linked to topup
      linkedPromises.push(addDoc(collection(db, 'sales'), {
        agentName: user.displayName || 'Unknown Agent',
        customerPhone: newTopUp.topUpNumber,
        linkedTopupId: topUpDoc.id, // Link to the topup
        items: [{
          activityType: (newTopUp.tariff.toLowerCase().includes('home internet') ? 'Home Internet Recharge' : 'Recharge') as ActivityType,
          value: amount,
          points: totalPoints
        }],
        totalAmount: amount,
        totalPoints: totalPoints,
        status: 'success',
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));

      if (newTopUp.customerId) {
        const customerRef = doc(db, 'customers', newTopUp.customerId);
        linkedPromises.push(updateDoc(customerRef, {
          currentBalance: increment(amount),
          updatedAt: serverTimestamp()
        }));
      }

      await Promise.all(linkedPromises);

      setIsTopUpModalOpen(false);
      setNewTopUp({ 
        customerId: '', 
        agentName: '',
        customerName: '',
        topUpNumber: '',
        contact: '',
        tariff: 'Smart@Home',
        amount: '', 
        renewDate: format(new Date(), 'yyyy-MM-dd'),
        period: '1',
        paymentMethod: 'Credit Card'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'topups');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSale = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this sale record?')) return;
    try {
      const sale = sales.find(s => s.id === id);
      await deleteDoc(doc(db, 'sales', id));
      
      // If it's a linked sale, also delete the topup
      if (sale && (sale as any).linkedTopupId) {
        await deleteDoc(doc(db, 'topups', (sale as any).linkedTopupId));
      }
      alert('Record deleted successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `sales/${id}`);
    }
  };

  const handleDeleteTopUp = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this top-up record?')) return;
    try {
      await deleteDoc(doc(db, 'topups', id));
      
      // Also find and delete the linked sale
      const salesQuery = query(collection(db, 'sales'), where('linkedTopupId', '==', id));
      const salesSnapshot = await getDocs(salesQuery);
      for (const saleDoc of salesSnapshot.docs) {
        await deleteDoc(saleDoc.ref);
      }
      alert('Record deleted successfully');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `topups/${id}`);
    }
  };
  
  const exportToCSV = (data: any[], fileName: string) => {
    if (!data.length) return;
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Header row
    csvRows.push(headers.join(','));
    
    // Data rows
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header];
        const escaped = ('' + val).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${fileName}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportDailySales = () => {
    const filtered = allActivities
      .filter(t => {
        const textMatch = t.agentName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                  (t.type === 'Sale' ? t.customerPhone : t.topUpNumber).includes(searchTerm);
        
        const date = t.timestamp?.toDate();
        if (!date) return textMatch;
        
        const dStr = format(date, 'yyyy-MM-dd');
        const dateMatch = dStr >= startDate && dStr <= endDate;
        
        return textMatch && dateMatch;
      });
    
    const dataToExport = filtered.map(t => ({
      Date: format(t.timestamp?.toDate() || new Date(), 'yyyy-MM-dd HH:mm'),
      Agent: t.agentName,
      'Customer Phone': t.type === 'Sale' ? t.customerPhone : t.topUpNumber,
      Type: t.type === 'Sale' ? 'General Sale' : 'Top Up',
      Points: (t.type === 'Sale' ? t.totalPoints : (t as TopUpRecord).points || 0).toFixed(2),
      'Total Amount': t.type === 'Sale' ? t.totalAmount : t.amount
    }));
    exportToCSV(dataToExport, 'Daily_Sale_Records');
  };

  const handleExportCustomers = () => {
    const filtered = customersWithLatestTopup
      .filter(c => {
        const textMatch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.phone || '').includes(searchTerm);
        
        const date = c.latestTopup ? c.latestTopup.timestamp?.toDate() : c.updatedAt.toDate();
        const dStr = format(date || new Date(), 'yyyy-MM-dd');
        const dateMatch = dStr >= startDate && dStr <= endDate;
        
        return textMatch && dateMatch;
      });
    
    const dataToExport = filtered.map(c => ({
      'Last Active Date': c.latestTopup ? format(c.latestTopup.timestamp?.toDate() || new Date(), 'yyyy-MM-dd HH:mm') : format(c.updatedAt.toDate(), 'yyyy-MM-dd HH:mm'),
      Agent: c.latestTopup?.agentName || 'System',
      'Customer Name': c.name,
      'Top Up No': c.phone,
      Contact: c.latestTopup?.contact || '-',
      Tariff: c.latestTopup?.tariff || '-',
      Amount: c.latestTopup?.amount || 0,
      'Renew Date': c.latestTopup ? format(c.latestTopup.renewDate.toDate(), 'yyyy-MM-dd') : '-',
      Period: c.latestTopup ? `${c.latestTopup.period} Months` : '-',
      Expiry: c.latestTopup ? format(c.latestTopup.expiryDate.toDate(), 'yyyy-MM-dd') : '-',
      Status: c.latestTopup?.status || 'Inactive'
    }));
    exportToCSV(dataToExport, 'Top_Up_Management');
  };

  const manualSales = sales
    .filter(s => s.agentName === user?.displayName && !(s as any).linkedTopupId)
    .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

  const subscriberTopups = topups
    .filter(t => t.agentName === user?.displayName)
    .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

  const allActivities = [
    ...manualSales.map(s => ({ ...s, type: 'Sale' as const })),
    ...subscriberTopups.map(t => ({ ...t, type: 'TopUp' as const }))
  ].sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));

  const totalRevenue = allActivities.reduce((acc, curr) => acc + (curr.status === 'success' ? (curr.type === 'Sale' ? curr.totalAmount : curr.amount) : 0), 0);
  const totalPoints = allActivities.reduce((acc, curr) => acc + (curr.status === 'success' ? (curr.type === 'Sale' ? curr.totalPoints : (curr as TopUpRecord).points || 0) : 0), 0);
  const activeCustomersCount = customers.length;
  const recentTransactions = allActivities.slice(0, 5);

  const filteredTopups = topups.filter(t => t.agentName === user?.displayName);
  const customersWithLatestTopup = customers.map(c => {
    const latestTopup = filteredTopups
      .filter(t => t.customerId === c.id)
      .sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0))[0];
    return { ...c, latestTopup };
  });

  const expiringSoonCustomers = customersWithLatestTopup.filter(c => {
    if (!c.latestTopup) return false;
    const expiryDate = c.latestTopup.expiryDate.toDate();
    const today = new Date();
    const sevenDaysFromNow = addDays(today, 7);
    return expiryDate >= today && expiryDate <= sevenDaysFromNow;
  });

  const handleQuickRenew = (customer: any) => {
    const latest = customer.latestTopup;
    if (!latest) return;

    const today = new Date();
    const currentExpiry = latest.expiryDate.toDate();
    
    // If not expired yet, start new period from current expiry
    // If expired, start from today
    const nextRenewDate = currentExpiry > today ? currentExpiry : today;

    setNewTopUp({
      customerId: customer.id,
      agentName: user?.displayName || '',
      customerName: customer.name,
      topUpNumber: customer.phone,
      contact: latest.contact || '',
      tariff: latest.tariff as TariffType,
      amount: latest.amount.toString(),
      renewDate: format(nextRenewDate, 'yyyy-MM-dd'),
      period: '1',
      paymentMethod: latest.paymentMethod || 'Cash'
    });
    setIsTopUpModalOpen(true);
  };

  const chartData = allActivities
    .slice(0, 10)
    .reverse()
    .map(t => ({
      name: format(t.timestamp?.toDate() || new Date(), 'HH:mm'),
      amount: t.type === 'Sale' ? t.totalAmount : t.amount
    }));

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium font-sans">Initializing Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-sm shadow-xl shadow-slate-200/50 border border-slate-200 text-center"
        >
          <div className="w-16 h-16 bg-indigo-600 rounded-sm flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
            <CreditCard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 font-sans tracking-tight">TopUp Dynamics</h1>
          <p className="text-slate-500 mb-8">Secure management dashboard for customer top-up records. Please sign in to continue.</p>
          <button 
            onClick={signInWithGoogle}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 px-6 rounded-md transition-all duration-200 flex items-center justify-center gap-3 shadow-lg shadow-slate-900/20 group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            Sign in with Google
          </button>
          <p className="mt-6 text-xs text-slate-400">Authorized Personnel Only</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans">
      {/* Sidebar - Desktop */}
      <aside className="w-full lg:w-68 bg-[#1E783F] flex flex-col text-white shadow-2xl relative overflow-hidden">
        {/* Abstract background accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />
        
        <div className="p-8 border-b border-white/10 flex items-center gap-4 relative">
          <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-lg flex items-center justify-center text-white font-black text-xl border border-white/20 shadow-lg">
            S
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tighter uppercase leading-none">Smart Shop</h2>
            <p className="text-[10px] font-medium text-white/50 tracking-widest uppercase mt-1">Dashboard Elite</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-8 space-y-2 relative">
          {[
            { id: 'overview', icon: TrendingUp, label: 'Overview' },
            { id: 'topups', icon: Users, label: 'Top Up' },
            { id: 'sales', icon: CreditCard, label: 'Daily Sale' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all font-bold text-[11px] uppercase tracking-[0.15em]",
                activeTab === item.id 
                  ? "bg-white text-[#1E783F] shadow-xl translate-x-1" 
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-[#1E783F]" : "text-white/50")} />
              {item.label}
            </button>
          ))}

        </nav>

        <div className="p-6 border-t border-white/10 bg-black/10">
          <div className="flex items-center gap-3 mb-6 bg-white/5 p-3 rounded-md border border-white/10">
            <img src={user.photoURL || ''} alt="avatar" className="w-8 h-8 rounded-sm shadow-sm" />
            <div className="overflow-hidden">
              <p className="text-[10px] font-black text-white truncate uppercase tracking-tighter">{user.displayName}</p>
              <p className="text-[10px] text-white/50 truncate tracking-tighter">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white bg-white/5 hover:bg-rose-500/20 hover:text-rose-200 rounded-md transition-all text-xs font-bold border border-white/10"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 lg:max-h-screen lg:overflow-y-auto p-4 lg:p-8 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {activeTab === 'overview' ? 'Business Overview' : activeTab === 'topups' ? 'Top Up Management' : 'Daily Sale Records'}
            </h1>
            <p className="text-slate-500 mt-1">Manage and track your customer records here.</p>
          </div>
          <div className="flex items-center gap-3">
            {activeTab === 'sales' && (
              <>
                <button 
                  onClick={handleExportDailySales}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md text-emerald-600 font-bold text-sm hover:bg-emerald-50 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button 
                  onClick={() => setIsSaleModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add New Sale
                </button>
              </>
            )}
            {activeTab === 'topups' && (
              <>
                <button 
                  onClick={handleExportCustomers}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-emerald-200 rounded-md text-emerald-600 font-bold text-sm hover:bg-emerald-50 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button 
                  onClick={() => setIsTopUpModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1E783F] text-white rounded-md font-bold text-sm hover:bg-opacity-90 transition-colors shadow-sm"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Top Up
                </button>
              </>
            )}
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Expiry Alerts */}
            {expiringSoonCustomers.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-100 rounded-full">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-amber-900 uppercase tracking-widest">Expiration Alerts</h3>
                    <p className="text-xs text-amber-700 font-medium">{expiringSoonCustomers.length} subscribers are expiring within 7 days.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {expiringSoonCustomers.map(customer => (
                    <div key={customer.id} className="bg-white p-3 rounded border border-amber-100 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{customer.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{customer.phone}</p>
                        <p className="text-[10px] font-black text-rose-500 mt-1">
                          Expires: {format(customer.latestTopup!.expiryDate.toDate(), 'MMM dd')}
                        </p>
                      </div>
                      <button 
                        onClick={() => handleQuickRenew(customer)}
                        className="px-3 py-1.5 bg-[#1E783F] text-white text-[10px] font-black uppercase tracking-tighter rounded hover:bg-opacity-90 transition-all shadow-sm"
                      >
                        Renew Now
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard 
                title="Total Revenue" 
                value={`$${totalRevenue.toLocaleString()}`} 
                icon={TrendingUp} 
                trend={12.5}
                color="bg-indigo-500" 
              />
              <StatCard 
                title="Total Points" 
                value={totalPoints.toFixed(1)} 
                icon={PlusCircle} 
                trend={8.4}
                color="bg-amber-500" 
              />
              <StatCard 
                title="Active Customers" 
                value={activeCustomersCount} 
                icon={Users} 
                trend={4.2}
                color="bg-violet-500" 
              />
              <StatCard 
                title="Success Rate" 
                value="99.8%" 
                icon={CheckCircle2} 
                color="bg-emerald-500" 
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Activity Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-sm shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Activity Overview</h3>
                  <select className="bg-slate-50 border border-slate-200 text-[10px] font-bold rounded px-3 py-1.5 text-slate-500 focus:ring-0 uppercase tracking-widest">
                    <option>Last 7 days</option>
                    <option>Last 30 days</option>
                  </select>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 10 }} 
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 10 }} 
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '4px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }}
                      />
                      <Bar dataKey="amount" fill="#6366f1" radius={[2, 2, 0, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Activity List */}
              <div className="bg-white p-6 rounded-sm shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-widest font-sans">Recent Top Ups</h3>
                <div className="space-y-6">
                  {recentTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-8 h-8 rounded-sm flex items-center justify-center font-bold text-white text-[10px] shadow-inner", t.type === 'Sale' ? "bg-indigo-500" : "bg-emerald-500")}>
                            {t.type === 'Sale' ? 'S' : 'R'}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{t.agentName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{format(t.timestamp?.toDate() || new Date(), 'MMM dd, HH:mm')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-indigo-600">+${t.type === 'Sale' ? t.totalAmount : t.amount}</p>
                          <p className="text-[9px] uppercase font-black text-emerald-600 tracking-tighter">
                            +{t.type === 'Sale' ? t.totalPoints.toFixed(1) : (t.amount * 1.5).toFixed(1)} PTS
                          </p>
                          <p className="text-[8px] uppercase font-medium text-slate-400 tracking-tighter">
                            {t.type === 'Sale' ? `${t.items.length} Activities` : t.tariff}
                          </p>
                        </div>
                      </div>
                    ))}
                  {recentTransactions.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">No transactions yet</p>
                    </div>
                  )}
                  <button 
                    onClick={() => setActiveTab('sales')}
                    className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-slate-50 rounded-sm transition-colors border border-slate-200 mt-4"
                  >
                    View All Sales
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {(activeTab === 'topups' || activeTab === 'sales') && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 rounded-sm shadow-sm border border-slate-200">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder={activeTab === 'topups' ? "Search subscribers..." : "Search sales..."}
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-2 hover:border-slate-300 transition-colors">
                    <span className="text-[9px] font-black text-slate-400 uppercase mr-1 whitespace-nowrap">From</span>
                    <input 
                      type="date" 
                      className="bg-transparent border-0 text-[10px] font-bold text-slate-600 focus:ring-0 py-1 px-1 min-w-[105px]"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-2 hover:border-slate-300 transition-colors">
                    <span className="text-[9px] font-black text-slate-400 uppercase mr-1 whitespace-nowrap">To</span>
                    <input 
                      type="date" 
                      className="bg-transparent border-0 text-[10px] font-bold text-slate-600 focus:ring-0 py-1 px-1 min-w-[105px]"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="h-6 w-[1px] bg-slate-200" />
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                  Recent {activeTab}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-sm shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {activeTab === 'customers' ? (
                        <>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Date</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[120px]">Agent</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[150px]">Customer Name</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[120px]">Top Up No.</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[120px]">Contact</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tariff</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[100px]">Renew Date</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[100px]">Expiry</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Actions</th>
                        </>
                      ) : (
                        <>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Date</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Agent</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer Phone</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Total Point</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Total Amount</th>
                          <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Actions</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {activeTab === 'topups' ? (
                      customersWithLatestTopup
                        .filter(c => {
                          const textMatch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.phone || '').includes(searchTerm);
                          const date = c.latestTopup ? c.latestTopup.timestamp?.toDate() : c.updatedAt.toDate();
                          const dStr = format(date || new Date(), 'yyyy-MM-dd');
                          const dateMatch = dStr >= startDate && dStr <= endDate;
                          return textMatch && dateMatch;
                        })
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-left">
                              {c.latestTopup ? (
                                <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{format(c.latestTopup.timestamp?.toDate() || new Date(), 'MMM dd, HH:mm')}</p>
                              ) : (
                                <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{format(c.updatedAt.toDate(), 'MMM dd, HH:mm')}</p>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-xs font-bold text-slate-900">{c.latestTopup?.agentName || 'System'}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-sm font-bold text-slate-700">{c.name}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-xs font-mono font-bold text-slate-600">{c.phone}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-[10px] text-slate-500">{c.email}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="space-y-1">
                                {c.latestTopup ? (
                                  <span className="text-[10px] font-black text-indigo-700 px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-sm">{c.latestTopup.tariff}</span>
                                ) : (
                                  <span className="text-[9px] text-slate-400 italic">No Subscription</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-sm font-black text-[#1E783F]">${c.currentBalance.toLocaleString()}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-[10px] font-medium text-slate-500 font-mono">
                                {c.latestTopup ? format(c.latestTopup.renewDate.toDate(), 'dd MMM yyyy') : '-'}
                              </p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-[10px] font-bold text-slate-600">
                                {c.latestTopup ? `${c.latestTopup.period} Months` : '-'}
                              </p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-[11px] font-black text-rose-600 font-mono">
                                {c.latestTopup ? format(c.latestTopup.expiryDate.toDate(), 'dd MMM yyyy') : '-'}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              {c.latestTopup ? <TransactionStatus status={c.latestTopup.status} /> : <span className="px-2 py-1 bg-slate-50 text-slate-400 text-[10px] font-bold uppercase rounded-full">Inactive</span>}
                            </td>
                            <td className="px-6 py-4 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  type="button"
                                  onClick={() => handleQuickRenew(c)}
                                  className="p-1 px-2 text-[10px] font-black bg-[#1E783F] text-white hover:bg-opacity-90 rounded transition-all shadow-sm flex items-center gap-1"
                                >
                                  <Clock className="w-3 h-3" />
                                  RENEW
                                </button>
                                {c.latestTopup && (
                                  <>
                                    <button 
                                      type="button"
                                      onClick={() => alert('Edit functionality coming soon')}
                                      className="p-1 px-2 text-[10px] font-bold text-slate-400 hover:text-indigo-600 border border-slate-100 hover:border-indigo-100 rounded transition-all"
                                    >
                                      EDIT
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => handleDeleteTopUp(c.latestTopup!.id)}
                                      className="p-1 px-2 text-[10px] font-bold text-slate-400 hover:text-rose-600 border border-slate-100 hover:border-rose-100 rounded transition-all"
                                    >
                                      DELETE
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                    ) : (
                      manualSales
                        .filter(s => {
                          const textMatch = s.customerPhone.includes(searchTerm) || s.agentName.toLowerCase().includes(searchTerm.toLowerCase());
                          const date = s.timestamp?.toDate();
                          if (!date) return textMatch;
                          const dStr = format(date, 'yyyy-MM-dd');
                          return dStr >= startDate && dStr <= endDate && textMatch;
                        })
                        .map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-left">
                                <p className="text-[10px] text-slate-400 font-mono tracking-tighter opacity-60">
                                  {format(t.timestamp?.toDate() || new Date(), 'MMM dd, HH:mm')}
                                </p>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-900 border-r border-slate-50">
                                {t.agentName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-900">
                                {t.customerPhone}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter shadow-sm border bg-amber-50 text-amber-700 border-amber-100">
                                  Gen Sale
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="flex flex-col items-center">
                                  <p className="text-[10px] font-black text-emerald-600 font-mono">
                                    +{t.totalPoints.toFixed(1)}
                                  </p>
                                  {t.items && (
                                    <div className="mt-1 flex flex-col items-center gap-0.5 opacity-60">
                                      {t.items.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-1 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                          <span>{item.activityType}</span>
                                          <span className="text-emerald-500">+{item.points.toFixed(1)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <p className="text-sm font-black text-[#1E783F] font-mono tracking-tighter">
                                  ${t.totalAmount.toLocaleString()}
                                </p>
                              </td>
                              <td className="px-6 py-4 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-2">
                                  <button 
                                    type="button"
                                    onClick={() => handleEditSale(t)}
                                    className="p-1 px-2 text-[10px] font-bold text-slate-400 hover:text-indigo-600 border border-slate-100 hover:border-indigo-100 rounded transition-all"
                                  >
                                    EDIT
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => handleDeleteSale(t.id)}
                                    className="p-1 px-2 text-[10px] font-bold text-slate-400 hover:text-rose-600 border border-slate-100 hover:border-rose-100 rounded transition-all"
                                  >
                                    DELETE
                                  </button>
                                </div>
                              </td>
                            </tr>
                        ))
                    )}
                  </tbody>
                </table>
                {(activeTab === 'customers' ? customers : allActivities).length === 0 && (
                  <div className="text-center py-24 text-slate-400">
                    <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p className="text-lg font-medium">No results found</p>
                    <p className="text-sm opacity-60">Try adjusting your search filters</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {isTopUpModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-sm overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="p-6 border-b border-slate-200 flex items-center justify-between text-slate-900">
                <h3 className="text-lg font-bold font-sans uppercase tracking-widest">Subscriber Top Up & Renewal</h3>
                <button onClick={() => setIsTopUpModalOpen(false)} className="hover:bg-slate-50 p-1.5 rounded transition-colors text-slate-400">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleTopUp} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Agent</label>
                    <input 
                      readOnly
                      required
                      type="text" 
                      className="w-full bg-slate-100 border border-slate-200 rounded py-2 px-3 text-sm font-bold text-slate-500 cursor-not-allowed"
                      value={newTopUp.agentName}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                      value={newTopUp.customerName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const existing = customers.find(c => c.name.toLowerCase() === val.toLowerCase());
                        setNewTopUp({ 
                          ...newTopUp, 
                          customerName: val,
                          customerId: existing?.id || '',
                          contact: existing?.phone || newTopUp.contact
                        });
                      }}
                      list="customer-datalist"
                    />
                    <datalist id="customer-datalist">
                      {customers.map(c => <option key={c.id} value={c.name} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Contact Info</label>
                    <input 
                      required
                      type="text" 
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                      value={newTopUp.contact}
                      onChange={(e) => setNewTopUp({ ...newTopUp, contact: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Top Up Number</label>
                    <input 
                      required
                      type="text" 
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                      placeholder="0xx xxx xxx"
                      value={newTopUp.topUpNumber}
                      onChange={(e) => setNewTopUp({ ...newTopUp, topUpNumber: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tariff Type</label>
                    <select 
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                      value={newTopUp.tariff}
                      onChange={(e) => setNewTopUp({ ...newTopUp, tariff: e.target.value as TariffType })}
                    >
                      {['Smart@Home', 'Fiber+', 'M2M', 'Postpaid', 'Smart Laor', 'Data Tamchet'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Amount ($)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-bold"
                      value={newTopUp.amount}
                      onChange={(e) => setNewTopUp({ ...newTopUp, amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Period (Months)</label>
                    <input 
                      required
                      type="number" 
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-bold"
                      value={newTopUp.period}
                      onChange={(e) => setNewTopUp({ ...newTopUp, period: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Renew Date</label>
                    <input 
                      required
                      type="date" 
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                      value={newTopUp.renewDate}
                      onChange={(e) => setNewTopUp({ ...newTopUp, renewDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expiry Date (Auto)</label>
                    <div className="w-full bg-slate-100 border border-slate-200 rounded py-2 px-3 text-sm font-bold text-indigo-600">
                      {format(addDays(new Date(newTopUp.renewDate), (parseInt(newTopUp.period) || 0) * 30), 'MMM dd, yyyy')}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Method</label>
                  <div className="flex gap-2">
                    {['Cash', 'ABA', 'Wing', 'Others'].map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setNewTopUp({ ...newTopUp, paymentMethod: method })}
                        className={cn(
                          "flex-1 py-2 rounded text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                          newTopUp.paymentMethod === method 
                            ? "bg-indigo-50 border-indigo-600 text-indigo-700" 
                            : "border-slate-100 text-slate-400"
                        )}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold py-3.5 rounded-sm shadow-sm transition-all flex items-center justify-center gap-2 uppercase text-xs tracking-widest"
                >
                  {submitting ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : 'Save Subscription Record'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isSaleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-sm overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 uppercase tracking-widest">{editingSaleId ? 'Edit Sale Record' : 'Add New Sale'}</h3>
                <button 
                  onClick={() => {
                    setIsSaleModalOpen(false);
                    setEditingSaleId(null);
                    setNewSale({
                      agentName: user?.displayName || '',
                      customerPhone: '',
                      items: [{ activityType: 'Prepaid GA', value: '', points: '' }],
                      date: format(new Date(), 'yyyy-MM-dd')
                    });
                  }} 
                  className="text-slate-400 hover:bg-slate-50 p-1 rounded transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateSale} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">Sale Date</label>
                    <input 
                      required
                      type="date" 
                      className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                      value={newSale.date}
                      onChange={(e) => setNewSale({ ...newSale, date: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">Agent Name</label>
                    <input 
                      readOnly
                      required
                      type="text" 
                      className="w-full bg-slate-100 border border-slate-200 rounded py-2 px-3 text-sm font-bold text-slate-500 cursor-not-allowed"
                      value={newSale.agentName}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">Customer Phone</label>
                  <input 
                    required
                    type="tel" 
                    className="w-full bg-slate-50 border border-slate-200 rounded py-2 px-3 focus:ring-1 focus:ring-indigo-500 text-sm font-medium"
                    placeholder="0xx xxx xxx"
                    value={newSale.customerPhone}
                    onChange={(e) => setNewSale({ ...newSale, customerPhone: e.target.value })}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sale Activities</label>
                    <button 
                      type="button"
                      onClick={() => setNewSale({ ...newSale, items: [...newSale.items, { activityType: 'Prepaid GA', value: '', points: '' }] })}
                      className="text-[10px] font-bold text-indigo-600 hover:underline"
                    >
                      + Add Activity
                    </button>
                  </div>
                  
                  {newSale.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-end bg-slate-50 p-3 rounded border border-slate-100">
                      <div className="flex-1">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Type</label>
                        <select 
                          className="w-full bg-white border border-slate-200 rounded py-1.5 px-2 text-xs"
                          value={item.activityType}
                          onChange={(e) => {
                            const newItems = [...newSale.items];
                            const activityType = e.target.value as ActivityType;
                            newItems[index].activityType = activityType;
                            
                            // Handle special fixed cases
                            if (activityType === 'SmartNas' || activityType === 'GA-eSIM') {
                              newItems[index].points = '2.0';
                            } else if (activityType === 'Change SIM') {
                              newItems[index].value = '2.00';
                              newItems[index].points = '2.0';
                            } else {
                              // Auto-calculate points based on current value for other types
                              const val = parseFloat(newItems[index].value) || 0;
                              const pts = val * (ACTIVITY_POINTS[activityType] || 0);
                              newItems[index].points = pts.toFixed(1);
                            }
                            
                            setNewSale({ ...newSale, items: newItems });
                          }}
                        >
                          {Object.keys(ACTIVITY_POINTS).map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-20">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Qty/USD</label>
                        <input 
                          type="number"
                          step="0.01"
                          required
                          disabled={item.activityType === 'SmartNas' || item.activityType === 'GA-eSIM' || item.activityType === 'Change SIM'}
                          className="w-full bg-white border border-slate-200 rounded py-1.5 px-2 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                          placeholder="0"
                          value={item.value}
                          onChange={(e) => {
                            const newItems = [...newSale.items];
                            newItems[index].value = e.target.value;
                            // Auto-calculate points
                            const val = parseFloat(e.target.value) || 0;
                            const currentType = newItems[index].activityType;
                            let pts = val * (ACTIVITY_POINTS[currentType] || 0);
                            if (currentType === 'SmartNas' || currentType === 'GA-eSIM' || currentType === 'Change SIM') {
                              pts = 2.0;
                            }
                            newItems[index].points = pts.toFixed(1);
                            setNewSale({ ...newSale, items: newItems });
                          }}
                        />
                      </div>
                      <div className="w-20">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1 whitespace-nowrap">Pts (Man)</label>
                        <input 
                          type="number"
                          step="0.1"
                          required
                          disabled={item.activityType === 'SmartNas' || item.activityType === 'GA-eSIM' || item.activityType === 'Change SIM'}
                          className="w-full bg-white border border-slate-200 rounded py-1.5 px-2 text-xs font-bold text-emerald-600 disabled:bg-slate-100 disabled:text-emerald-300"
                          placeholder="0"
                          value={item.points}
                          onChange={(e) => {
                            const newItems = [...newSale.items];
                            newItems[index].points = e.target.value;
                            setNewSale({ ...newSale, items: newItems });
                          }}
                        />
                      </div>
                      {newSale.items.length > 1 && (
                        <button 
                          type="button"
                          onClick={() => {
                            const newItems = newSale.items.filter((_, i) => i !== index);
                            setNewSale({ ...newSale, items: newItems });
                          }}
                          className="p-1.5 text-rose-400 hover:text-rose-600"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-slate-900 rounded text-white flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total Points</p>
                    <p className="text-xl font-bold">{newSale.items.reduce((sum, item) => sum + (parseFloat(item.points) || 0), 0).toFixed(1)} PTS</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total Amount</p>
                    <p className="text-xl font-bold">${newSale.items.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0).toLocaleString()}</p>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold py-3 rounded-sm shadow-sm transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (editingSaleId ? 'Save Changes' : 'Confirm & Finalize Sale')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
