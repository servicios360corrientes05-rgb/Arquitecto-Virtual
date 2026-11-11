import Home from './HomeClient';

// Se renderiza en cada pedido: el informe lleva datos del catastro provincial
// que cambian con cada consulta, asi que no se guarda una copia fija.
export const dynamic = 'force-dynamic';

export default function Page() {
  return <Home />;
}
