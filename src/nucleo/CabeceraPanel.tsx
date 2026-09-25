export function CabeceraPanel({titulo,cerrar,acoplado,alternar,cierre}:{titulo:string;cerrar:()=>void;acoplado:boolean;alternar:()=>void;cierre:string}) {
  return <header><b>{titulo}</b><div className="acciones-panel"><button aria-label={acoplado?'Desacoplar panel':'Acoplar panel'} title={acoplado?'Desacoplar panel':'Acoplar panel'} aria-pressed={acoplado} onClick={alternar}>▣</button><button aria-label={cierre} onClick={cerrar}>×</button></div></header>
}
