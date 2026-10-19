// os testes conferem textos em português: o idioma fica fixo em pt, seja qual for o do sistema
// (sem importar o i18n.ts aqui: ele lê o idioma ao carregar, e tem de ler depois desta linha)
import { store } from '../src/client/store.ts';

store.set('warlock:lang', 'pt');
