import type { EntradaMenu } from './tipos'
import { ejecutarObjetos, ponerPropiedades, propiedades, type ObjetoEditable } from './objetos'
import { leerDependencias } from './derivados'

interface Contexto {
  s: any
  objetos: ObjetoEditable[]
  seleccion: string[]
  elegir: (ids: string[]) => void
  propiedades: () => void
  ordenar: boolean
}

function relaciones(c: Contexto, hacia: 'origen' | 'dependiente'): string[] {
  const aristas = [
    ...leerDependencias(c.s).map(d => [d.origen,d.objeto]),
    ...(c.s.elementos ?? []).flatMap((o:any)=>[o.a,o.b].filter(Boolean).map(id=>[id,o.id])),
    ...(c.s.objs ?? []).flatMap((o: any) => typeof o.args === 'string' ? o.args.split(',').filter(Boolean).map((id: string) => [id,o.id]) : []),
  ]
  const ids = new Set(c.seleccion)
  let crece = true
  while (crece) {
    crece = false
    for (const [origen,destino] of aristas) {
      const [a,b] = hacia === 'origen' ? [destino,origen] : [origen,destino]
      if (ids.has(a) && !ids.has(b)) { ids.add(b); crece = true }
    }
  }
  return c.objetos.filter(o => ids.has(o.id)).map(o => o.id)
}

export function menuSeleccion(c: Contexto): EntradaMenu<any>[] {
  const tipos = [...new Set(c.objetos.map(o => o.tipo ?? 'capa'))]
  return [{ id:'seleccion',t:'Seleccionar',hijos:[
    {id:'seleccion.todo',t:'Todo',hacer:()=>c.elegir(c.objetos.map(o=>o.id))},
    {id:'seleccion.nada',t:'Nada',hacer:()=>c.elegir([])},
    {id:'seleccion.invertir',t:'Invertir',hacer:()=>c.elegir(c.objetos.filter(o=>!c.seleccion.includes(o.id)).map(o=>o.id))},
    {id:'seleccion.tipo',t:'Por tipo',desactivado:!tipos.length,hijos:tipos.map(tipo=>({id:`seleccion.tipo.${tipo}`,t:tipo,hacer:()=>c.elegir(c.objetos.filter(o=>(o.tipo??'capa')===tipo).map(o=>o.id))}))},
    {id:'seleccion.grupo',t:'Mismo grupo',desactivado:!c.seleccion.some(id=>propiedades(c.s,id).grupo),hacer:()=>{const grupos=c.seleccion.map(id=>propiedades(c.s,id).grupo).filter(Boolean);c.elegir(c.objetos.filter(o=>grupos.includes(propiedades(c.s,o.id).grupo)).map(o=>o.id))}},
    {id:'seleccion.origenes',t:'Objetos de origen',desactivado:!c.seleccion.length,hacer:()=>c.elegir(relaciones(c,'origen'))},
    {id:'seleccion.dependientes',t:'Dependientes',desactivado:!c.seleccion.length,hacer:()=>c.elegir(relaciones(c,'dependiente'))},
  ]}]
}

export function menuObjetos(c: Contexto): EntradaMenu<any>[] {
  const {s,objetos,seleccion} = c
  const escogidos = objetos.filter(o=>seleccion.includes(o.id))
  const sin = !seleccion.length
  const cambiar = (p: Parameters<typeof ponerPropiedades>[2]) => () => ponerPropiedades(s,seleccion,p)
  return [
    {id:'objeto.propiedades',t:'Propiedades…',atajo:'CmdOrCtrl+I',hacer:c.propiedades},
    ...(['duplicar','ocultar','mostrar','aislar','eliminar'] as const).map(op=>({
      id:`objeto.${op}`,
      t:({duplicar:'Duplicar selección',ocultar:'Ocultar selección',mostrar:'Mostrar selección',aislar:'Aislar selección',eliminar:'Eliminar selección'})[op],
      desactivado:sin || !escogidos.some(o=>op==='duplicar'?o.duplicar:op==='eliminar'?o.quitar:o.alternar),
      hacer:()=>{
        const p=ejecutarObjetos(s,objetos,seleccion,op)
        if(op==='aislar') {
          let estado=s
          for(const o of objetos) if(o.alternar && propiedades(s,o.id).aisladoVisible===undefined) estado={...estado,...ponerPropiedades(estado,[o.id],{aisladoVisible:o.visible!==false})}
          return {...p,_objetos:estado._objetos}
        }
        return p
      },
    })),
    {id:'objeto.salirAislamiento',t:'Salir de aislamiento',desactivado:!objetos.some(o=>propiedades(s,o.id).aisladoVisible!==undefined),hacer:()=>{
      let estado=s
      for(const o of objetos) {
        const antes=propiedades(s,o.id).aisladoVisible
        if(antes===undefined)continue
        if(antes!==(o.visible!==false) && o.alternar)estado={...estado,...o.alternar(estado)}
        estado={...estado,...ponerPropiedades(estado,[o.id],{aisladoVisible:undefined})}
      }
      return estado
    }},
    {id:'objeto.organizacion',t:'Organización',hijos:[
      {id:'objeto.agrupar',t:'Agrupar selección',desactivado:seleccion.length<2,hacer:()=>ponerPropiedades(s,seleccion,{grupo:crypto.randomUUID()})},
      {id:'objeto.desagrupar',t:'Desagrupar',desactivado:!escogidos.some(o=>propiedades(s,o.id).grupo),hacer:cambiar({grupo:undefined})},
      ...([['frente','Traer al frente',1],['fondo','Enviar al fondo',-1]] as const).map(([id,t,signo])=>({id:`objeto.${id}`,t,desactivado:sin||!c.ordenar,hacer:()=>{
        const ordenes=objetos.map((o,i)=>propiedades(s,o.id).orden??i)
        const borde=signo>0?Math.max(0,...ordenes):Math.min(0,...ordenes)
        return ponerPropiedades(s,seleccion,{orden:borde+signo})
      }})),
    ]},
    {id:'objeto.bloquear',t:'Bloquear movimiento',tipo:'casilla',activo:!sin&&escogidos.every(o=>propiedades(s,o.id).bloqueado),desactivado:sin||!escogidos.every(o=>o.estilo),hacer:cambiar({bloqueado:!escogidos.every(o=>propiedades(s,o.id).bloqueado)})},
    {id:'objeto.independiente',t:'Desvincular resultado',desactivado:!leerDependencias(s).some(d=>seleccion.includes(d.objeto)),hacer:()=>({_derivados:leerDependencias(s).filter(d=>!seleccion.includes(d.objeto))})},
  ]
}
