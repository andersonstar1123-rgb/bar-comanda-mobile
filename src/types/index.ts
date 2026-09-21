export interface User {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'gerente' | 'garcom';
}

export interface Categoria {
  id: string;
  nome: string;
  descricao?: string;
  ordem: number;
  ativo: boolean;
  precisa_preparo?: number;
  produtos?: Produto[];
}

export interface Produto {
  id: string;
  categoria_id: string;
  nome: string;
  descricao?: string;
  preco: number;
  imagem_url?: string;
  ativo: boolean;
  estoque: number;
  ordem: number;
}

export interface Mesa {
  id: string;
  numero: number;
  nome?: string;
  status: 'livre' | 'ocupada' | 'reservada';
  capacidade: number;
  comanda_aberta_id?: string;
  comandas_abertas?: number;
  total_aberto?: number;
  aberto_em?: string;
  cliente_nome?: string;
}

export interface ItemComanda {
  id: string;
  id_local?: string;
  comanda_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  observacao?: string;
  status: 'pendente' | 'enviado' | 'preparando' | 'pronto' | 'entregue' | 'cancelado';
  enviado?: boolean;
  produto_nome?: string;
  produto_imagem?: string;
}

export interface Comanda {
  id: string;
  id_local?: string;
  mesa_id: string;
  usuario_id: string;
  status: 'aberta' | 'fechada' | 'paga';
  total: number;
  observacao?: string;
  cliente_nome?: string;
  aberto_em: string;
  fechado_em?: string;
  mesa_numero?: number;
  mesa_nome?: string;
  usuario_nome?: string;
  itens?: ItemComanda[];
  pagamentos?: Pagamento[];
}

export interface Pagamento {
  id: string;
  id_local?: string;
  comanda_id: string;
  forma: 'dinheiro' | 'cartao' | 'pix' | 'outro';
  valor: number;
  troco: number;
  referencia?: string;
  criado_em: string;
}

export interface Configuracoes {
  bar_nome: string;
  bar_logo: string;
  bar_background: string;
  bar_cor_primaria: string;
  bar_cor_secundaria: string;
  moeda: string;
}

export interface SyncItem {
  entidade: string;
  acao: 'criar' | 'atualizar' | 'fechar' | 'reabrir' | 'adicionar' | 'cancelar';
  dados: any;
  id_local: string;
  timestamp: string;
}