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
  Target
} from 'lucide-react';

// --- Importações do Firebase ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';

// --- Configuração do Firebase ---
let firebaseConfig = {
  apiKey: "AIzaSyCKRPp2IU1iWt-n2CZ9U950dtwm_1PQm1o",
  authDomain: "meu-manejo-financeiro.firebaseapp.com",
  projectId: "meu-manejo-financeiro"
};
if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'meu-gerenciador-local';

// --- Constantes e Categorias ---
const CATEGORIES = [
  { id: 'essencial', name: 'Essencial (Casa, Mercado)', color: '#3b82f6' }, // Azul
  { id: 'estilo', name: 'Estilo de Vida (Lazer)', color: '#8b5cf6' },       // Roxo
  { id: 'dividas', name: 'Dívidas / Parcelas', color: '#ef4444' },          // Vermelho
  { id: 'investimento', name: 'Reserva / Futuro', color: '#10b981' },       // Verde
  { id: 'outros', name: 'Outros', color: '#64748b' }                        // Cinza
];

const App = () => {
  // --- Estado ---
  const [user, setUser] = useState(null);
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('despesa');
  const [category, setCategory] = useState('essencial');
  const [filter, setFilter] = useState('todos');

  // --- Função do Modo de Teste Offline ---
  const handleTestMode = async () => {
    try {
      await signInAnonymously(auth);
      setPreviewUnlocked(true);
    } catch (error) {
      console.warn("Modo offline ativado: Firebase ainda não configurado com chaves reais.");
      // Forçamos um utilizador falso para conseguir testar o design e a lógica localmente
      setUser({ uid: 'utilizador-teste-local', isAnonymous: true, displayName: 'Modo Teste' });
      setPreviewUnlocked(true);
    }
  };

  // --- Efeitos do Firebase ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (typeof __firebase_config !== 'undefined') {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    // Se estiver no modo de teste local, não tenta ir à nuvem
    if (user.uid === 'utilizador-teste-local') {
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

  // --- Funções de Login / Logout ---
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Erro no login", error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setPreviewUnlocked(false);
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

  // --- Ações ---
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

    // Salvar localmente se estiver no modo de teste
    if (user.uid === 'utilizador-teste-local') {
      setTransactions(prev => [{id: Date.now().toString(), ...newTransaction}, ...prev]);
      setDescription('');
      setValue('');
      return;
    }

    try {
      const q = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
      await addDoc(q, newTransaction);
      setDescription('');
      setValue('');
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const removeTransaction = async (id) => {
    if (!user) return;

    // Remover localmente se estiver no modo de teste
    if (user.uid === 'utilizador-teste-local') {
      setTransactions(prev => prev.filter(t => t.id !== id));
      return;
    }

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id));
    } catch (error) {
      console.error("Erro:", error);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'todos') return true;
    return t.type === filter;
  });

  // --- TELA DE LOGIN OBRIGATÓRIA (SaaS Design) ---
  if (!user || (user.isAnonymous && !previewUnlocked)) {
    return (
      <div className="min-h-screen flex font-sans bg-white">
        {/* Lado Esquerdo - Branding */}
        <div className="hidden lg:flex w-1/2 bg-slate-900 p-12 text-white flex-col justify-between relative overflow-hidden">
          {/* Elementos decorativos de fundo */}
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-16">
              <div className="bg-blue-600 p-2 rounded-xl">
                <Wallet size={28} className="text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">ManejoApp</span>
            </div>
            <h1 className="text-5xl font-extrabold mb-6 leading-tight">
              A integridade das suas contas, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">sob controle.</span>
            </h1>
            <p className="text-slate-400 text-lg max-w-md leading-relaxed mb-8">
              Educação financeira prática. Monitore seus gastos, fuja das dívidas e construa seu futuro em uma única plataforma segura.
            </p>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-slate-300">
                <ShieldCheck size={20} className="text-blue-400" />
                <span>Dados isolados e protegidos na nuvem</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300">
                <Target size={20} className="text-indigo-400" />
                <span>Metas claras para sair do aperto</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
            <p className="italic text-slate-300">"Finalmente consegui entender para onde meu dinheiro estava indo. A regra 50-30-20 mudou minha vida."</p>
          </div>
        </div>

        {/* Lado Direito - Login */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 relative">
          <div className="max-w-md w-full">
            <div className="lg:hidden flex justify-center mb-8">
               <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-200">
                  <Wallet size={32} className="text-white" />
               </div>
            </div>
            
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Bem-vindo de volta</h2>
              <p className="text-slate-500">Acesse seu painel financeiro.</p>
            </div>

            <button 
              onClick={handleLogin}
              className="w-full bg-white border border-slate-200 text-slate-700 py-3.5 rounded-xl font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center justify-center gap-3 mb-6 group"
            >
              <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continuar com Google
            </button>
            
            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-xs uppercase tracking-wider font-medium">Ou teste sem conta</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button 
              onClick={handleTestMode}
              className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-semibold hover:bg-slate-800 transition shadow-lg flex items-center justify-center gap-2"
            >
              <Activity size={18} />
              Acessar Ambiente de Teste
            </button>
            
            <p className="text-center text-xs text-slate-400 mt-8">
              Ao continuar, você concorda em cuidar melhor do seu dinheiro.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- TELA DO DASHBOARD PRINCIPAL ---
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 pb-12">
      {/* Navbar Superior */}
      <nav className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Wallet size={20} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">ManejoApp</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                const data = JSON.stringify(transactions, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'minhas-financas.json';
                a.click();
              }}
              className="hidden sm:flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
            >
              <Download size={16} /> Exportar
            </button>
            <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
                {(user?.displayName || 'U')[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden md:block">
                {user.displayName || 'Usuário'}
              </span>
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title="Sair"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        
        {/* Header da Página */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Resumo Financeiro</h1>
          <p className="text-slate-500">Mantenha a integridade das suas contas em dia.</p>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition duration-300">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Entradas</p>
              <div className="bg-emerald-100/50 p-2 rounded-lg text-emerald-600">
                <TrendingUp size={20} />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-slate-900">
              R$ {totals.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h2>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition duration-300">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Saídas</p>
              <div className="bg-rose-100/50 p-2 rounded-lg text-rose-600">
                <TrendingDown size={20} />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-slate-900">
              R$ {totals.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h2>
          </div>

          <div className={`p-6 rounded-2xl shadow-md border transition duration-300 relative overflow-hidden ${balance >= 0 ? 'bg-gradient-to-br from-blue-600 to-indigo-700 border-indigo-500' : 'bg-gradient-to-br from-rose-500 to-red-600 border-red-500'}`}>
            <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
              <Wallet size={120} />
            </div>
            <div className="relative z-10 flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-white/80 uppercase tracking-wider">Saldo Atual</p>
            </div>
            <h2 className="relative z-10 text-4xl font-extrabold text-white tracking-tight">
              R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Coluna Esquerda: Formulário e Gráfico */}
          <div className="lg:col-span-1 space-y-8">
            {/* Novo Lançamento */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                <Plus size={20} className="text-blue-600" />
                Registrar Movimento
              </h3>
              <form onSubmit={handleAddTransaction} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descrição</label>
                  <input 
                    type="text" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Salário, Mercado..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Valor (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo</label>
                    <select 
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </div>
                </div>

                {type === 'despesa' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoria</label>
                    <select 
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium text-sm"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={!user}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                >
                  <Plus size={18} />
                  Adicionar
                </button>
              </form>
            </div>

            {/* Análise de Categorias */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                <PieChartIcon size={20} className="text-indigo-600" />
                Para onde vai o dinheiro?
              </h3>
              
              {totals.expense === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  Adicione despesas para ver a análise.
                </div>
              ) : (
                <div className="space-y-4">
                  {CATEGORIES.map(cat => {
                    const val = categoryData[cat.id] || 0;
                    const percent = totals.expense > 0 ? (val / totals.expense) * 100 : 0;
                    if (percent === 0) return null;
                    
                    return (
                      <div key={cat.id}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="font-medium text-slate-700">{cat.name.split(' (')[0]}</span>
                          <span className="font-bold text-slate-900">{percent.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out" 
                            style={{ width: `${percent}%`, backgroundColor: cat.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Lista de Transações e Dicas */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Calendar size={20} className="text-blue-600" />
                  Histórico de Movimentações
                </h3>
                
                {/* Filtros Modernos */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                   <button 
                    onClick={() => setFilter('todos')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === 'todos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >Todos</button>
                   <button 
                    onClick={() => setFilter('receita')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === 'receita' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >Receitas</button>
                   <button 
                    onClick={() => setFilter('despesa')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === 'despesa' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >Despesas</button>
                </div>
              </div>

              <div className="overflow-x-auto flex-grow">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="px-6 py-4 font-semibold">Detalhes</th>
                      <th className="px-6 py-4 font-semibold hidden sm:table-cell">Categoria</th>
                      <th className="px-6 py-4 font-semibold text-right">Valor</th>
                      <th className="px-6 py-4 font-semibold text-center w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-16 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <Activity size={40} className="mb-3 opacity-50" />
                            <p className="text-sm font-medium">Nenhum registro encontrado.</p>
                            <p className="text-xs mt-1">Sua vida financeira começa aqui.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full hidden sm:flex ${t.type === 'receita' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                {t.type === 'receita' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{t.description}</p>
                                <p className="text-xs text-slate-500 font-medium">{t.date}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 hidden sm:table-cell">
                            <span className={`text-xs px-2.5 py-1 rounded-md font-semibold ${
                              t.type === 'receita' 
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {t.type === 'receita' ? 'Renda Extra / Salário' : CATEGORIES.find(c => c.id === t.category)?.name.split(' (')[0]}
                            </span>
                          </td>
                          <td className={`px-6 py-4 text-right font-bold tracking-tight ${t.type === 'receita' ? 'text-emerald-600' : 'text-slate-900'}`}>
                            {t.type === 'despesa' ? '-' : '+'} R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button 
                              onClick={() => removeTransaction(t.id)}
                              className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Educação Financeira (Foco em manter longe de dívidas) */}
            <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute right-[-20px] top-[-20px] opacity-10">
                <ShieldCheck size={140} />
              </div>
              <div className="relative z-10 flex gap-4 items-start">
                <div className="bg-blue-500 p-3 rounded-xl shrink-0">
                  <Filter size={24} className="text-white" />
                </div>
                <div>
                  <h4 className="text-lg font-bold mb-1 text-white">Missão: Longe das Dívidas</h4>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    A regra de ouro (50-30-20) diz que seus custos fixos devem estar em 50%. Se o gráfico <strong>"Essencial"</strong> ultrapassar isso, é hora de ligar o alerta. Use o restinho do orçamento para construir sua reserva.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
