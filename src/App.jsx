import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  PieChart as PieChartIcon, 
  Activity,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  LogOut,
  LogIn,
  ShieldCheck,
  Target,
  Mail,
  Lock,
  AlertCircle
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';

// Configuração Oficial
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'meu-gerenciador-local';

const CATEGORIES = [
  { id: 'essencial', name: 'Essencial (Casa, Mercado)', color: '#3b82f6' },
  { id: 'estilo', name: 'Estilo de Vida (Lazer)', color: '#8b5cf6' },
  { id: 'dividas', name: 'Dívidas / Parcelas', color: '#ef4444' },
  { id: 'investimento', name: 'Reserva / Futuro', color: '#10b981' },
  { id: 'outros', name: 'Outros', color: '#64748b' }
];

const App = () => {
  // --- Estados Principais ---
  const [user, setUser] = useState(null);
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  const [transactions, setTransactions] = useState([]);
  
  // --- Estados do Formulário de Transação ---
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('despesa');
  const [category, setCategory] = useState('essencial');
  const [filter, setFilter] = useState('todos');

  // --- Estados do Formulário de Login ---
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // --- Efeitos ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || user.uid === 'utilizador-teste-local') {
      if (!user) setTransactions([]);
      return;
    }
    
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));
      data.sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(data);
    }, (error) => console.error("Erro Firebase:", error));

    return () => unsubscribe();
  }, [user]);

  // --- Autenticação ---
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    if (!authEmail || !authPassword) {
      setAuthError('Por favor, preencha e-mail e senha.');
      setIsLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (error) {
      console.error("Erro Auth:", error.code);
      // Tradução dos erros mais comuns do Firebase para melhorar a UX
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setAuthError('E-mail ou senha incorretos.');
          break;
        case 'auth/email-already-in-use':
          setAuthError('Este e-mail já está cadastrado.');
          break;
        case 'auth/weak-password':
          setAuthError('A senha deve ter pelo menos 6 caracteres.');
          break;
        case 'auth/invalid-email':
          setAuthError('Formato de e-mail inválido.');
          break;
        default:
          setAuthError('Ocorreu um erro. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        setAuthError('Erro ao entrar com Google.');
      }
    }
  };

  const handleTestMode = async () => {
    try {
      await signInAnonymously(auth);
      setPreviewUnlocked(true);
    } catch (error) {
      setUser({ uid: 'utilizador-teste-local', isAnonymous: true, displayName: 'Modo Teste' });
      setPreviewUnlocked(true);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setPreviewUnlocked(false);
    setAuthEmail('');
    setAuthPassword('');
  };

  // --- Cálculos ---
  const totals = useMemo(() => {
    return transactions.reduce((acc, curr) => {
      if (curr.type === 'receita') acc.income += curr.value;
      else acc.expense += curr.value;
      return acc;
    }, { income: 0, expense: 0 });
  }, [transactions]);

  const balance = totals.income - totals.expense;

  const categoryData = useMemo(() => {
    const data = {};
    transactions.filter(t => t.type === 'despesa').forEach(t => {
      data[t.category] = (data[t.category] || 0) + t.value;
    });
    return data;
  }, [transactions]);

  // --- Transações ---
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!description || !value || !user) return;

    const newTransaction = {
      description,
      value: parseFloat(value),
      type,
      category: type === 'receita' ? 'renda' : category,
      date: new Date().toLocaleDateString('pt-BR'),
      timestamp: Date.now()
    };

    if (user.uid === 'utilizador-teste-local') {
      setTransactions(prev => [{id: Date.now().toString(), ...newTransaction}, ...prev]);
      setDescription(''); setValue(''); return;
    }

    try {
      const q = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
      await addDoc(q, newTransaction);
      setDescription(''); setValue('');
    } catch (error) {
      console.error(error);
    }
  };

  const removeTransaction = async (id) => {
    if (!user) return;
    if (user.uid === 'utilizador-teste-local') {
      setTransactions(prev => prev.filter(t => t.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id));
    } catch (error) {
      console.error(error);
    }
  };

  const filteredTransactions = transactions.filter(t => filter === 'todos' || t.type === filter);

  // ==========================================
  // TELA DE LOGIN (ATUALIZADA)
  // ==========================================
  if (!user || (user.isAnonymous && !previewUnlocked)) {
    return (
      <div className="min-h-screen flex font-sans bg-slate-50">
        {/* Painel Esquerdo - Branding */}
        <div className="hidden lg:flex w-1/2 bg-slate-900 p-12 text-white flex-col justify-between relative overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-16">
              <div className="bg-blue-600 p-2 rounded-xl"><Wallet size={28} /></div>
              <span className="text-xl font-bold">ManejoApp</span>
            </div>
            <h1 className="text-5xl font-extrabold mb-6">Integridade financeira, <span className="text-blue-400">sob seu comando.</span></h1>
            <p className="text-slate-400 text-lg max-w-md">Organize seu dinheiro, entenda seus gastos e mantenha suas contas em dia, longe de dívidas.</p>
          </div>
          
          <div className="relative z-10 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <ShieldCheck className="text-emerald-400" size={24} />
              <h4 className="font-bold">Privacidade Garantida</h4>
            </div>
            <p className="text-sm text-slate-300">Seus dados financeiros são criptografados e acessíveis apenas por você. Crie sua conta com e-mail ou use o Google.</p>
          </div>
        </div>

        {/* Painel Direito - Formulário */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
            
            <div className="lg:hidden flex justify-center mb-6">
               <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200">
                  <Wallet size={32} className="text-white" />
               </div>
            </div>

            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">
                {isRegistering ? 'Criar nova conta' : 'Bem-vindo de volta'}
              </h2>
              <p className="text-slate-500">
                {isRegistering ? 'Dê o primeiro passo rumo à liberdade financeira.' : 'Acesse seu painel financeiro.'}
              </p>
            </div>

            {authError && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                <AlertCircle size={18} className="shrink-0" />
                <p>{authError}</p>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">E-mail</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail size={18} className="text-slate-400" />
                  </div>
                  <input 
                    type="email" 
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Senha</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock size={18} className="text-slate-400" />
                  </div>
                  <input 
                    type="password" 
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 mt-6 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Aguarde...' : (isRegistering ? 'Criar Conta' : 'Entrar')}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button 
                type="button"
                onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); }}
                className="text-sm text-slate-500 hover:text-blue-600 font-medium transition"
              >
                {isRegistering ? 'Já tem uma conta? Faça login' : 'Não tem conta? Crie uma agora'}
              </button>
            </div>

            <div className="relative flex py-6 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase tracking-wider font-bold">Ou alternativas</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={handleGoogleLogin} 
                type="button"
                className="w-full bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-semibold hover:bg-slate-50 transition shadow-sm flex items-center justify-center gap-3 group"
              >
                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              
              <button 
                onClick={handleTestMode} 
                type="button"
                className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-semibold hover:bg-slate-200 transition flex items-center justify-center gap-2"
              >
                <Activity size={18} /> Testar Offline
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // TELA DO DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 pb-12">
      <nav className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg"><Wallet size={20} className="text-white" /></div>
            <span className="font-bold text-lg text-slate-900">ManejoApp</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 mr-4 border-r pr-4 border-slate-200">
              <span className="text-sm font-medium text-slate-600">
                {user.displayName || user.email?.split('@')[0] || 'Utilizador'}
              </span>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-rose-600 transition">
              Sair <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 mt-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Resumo Financeiro</h1>
          <p className="text-slate-500 italic">"A regra 50-30-20 é o escudo contra as dívidas."</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Entradas</p>
            <h2 className="text-2xl font-bold text-emerald-600">R$ {totals.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Saídas</p>
            <h2 className="text-2xl font-bold text-rose-600">R$ {totals.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          </div>
          <div className={`p-6 rounded-2xl shadow-md text-white relative overflow-hidden ${balance >= 0 ? 'bg-gradient-to-br from-blue-600 to-indigo-700' : 'bg-gradient-to-br from-rose-500 to-red-600'}`}>
            <Wallet className="absolute right-[-20px] bottom-[-20px] opacity-10" size={100} />
            <p className="relative z-10 text-xs font-bold uppercase mb-2 opacity-80">Saldo Atual</p>
            <h2 className="relative z-10 text-3xl font-bold">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="font-bold mb-4 flex items-center gap-2"><Plus size={18} className="text-blue-600"/> Novo Registro</h3>
              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descrição</label>
                  <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Conta de Luz" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="0,00" className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                    <select value={type} onChange={e => setType(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm">
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </div>
                  {type === 'despesa' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoria</label>
                      <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium text-sm">
                        {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.name.split(' (')[0]}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <button type="submit" className="w-full bg-slate-900 text-white p-3 rounded-xl font-bold hover:bg-slate-800 transition-colors mt-2">
                  Salvar Lançamento
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
               <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
                  <h3 className="font-bold flex items-center gap-2"><Calendar size={18} className="text-blue-600"/> Histórico</h3>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    {['todos', 'receita', 'despesa'].map(f => (
                      <button 
                        key={f} 
                        onClick={() => setFilter(f)} 
                        className={`px-4 py-1.5 text-sm font-bold rounded-lg capitalize transition-all ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
               </div>
               
               <div className="overflow-x-auto flex-grow">
                 <table className="w-full text-left text-sm">
                   <tbody className="divide-y divide-slate-100">
                     {filteredTransactions.length === 0 ? (
                        <tr>
                          <td className="p-8 text-center text-slate-400">
                            <Activity size={32} className="mx-auto mb-2 opacity-50" />
                            Nenhuma movimentação encontrada.
                          </td>
                        </tr>
                     ) : (
                       filteredTransactions.map(t => (
                         <tr key={t.id} className="hover:bg-slate-50 group transition-colors">
                           <td className="p-4">
                             <div className="flex items-center gap-3">
                               <div className={`p-2 rounded-full hidden sm:flex ${t.type === 'receita' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                 {t.type === 'receita' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                               </div>
                               <div>
                                 <p className="font-bold text-slate-900">{t.description}</p>
                                 <p className="text-xs text-slate-500 font-medium">{t.date}</p>
                               </div>
                             </div>
                           </td>
                           <td className={`p-4 font-bold text-right tracking-tight ${t.type === 'receita' ? 'text-emerald-600' : 'text-slate-900'}`}>
                             {t.type === 'receita' ? '+' : '-'} R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                           </td>
                           <td className="p-4 text-center w-16">
                             <button 
                               onClick={() => removeTransaction(t.id)} 
                               className="text-slate-300 hover:text-rose-600 transition opacity-0 group-hover:opacity-100 p-2"
                               title="Apagar"
                             >
                               <Trash2 size={16}/>
                             </button>
                           </td>
                         </tr>
                       ))
                     )}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
