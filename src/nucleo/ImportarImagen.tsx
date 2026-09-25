import { useState } from 'react'
import { numeroHerramienta } from '../lib/herramientas'
import type { AjustesEscena } from './escena'

export function ImportarImagen({onCerrar,onImportar}:{onCerrar:()=>void;onImportar:(imagen:NonNullable<AjustesEscena['imagen']>)=>void}) {
  const [datos,setDatos]=useState(''),[error,setError]=useState('')
  const [campos,setCampos]=useState({x:'0',y:'0',ancho:'10',alto:'10',opacidad:'0.5'})
  return <div className="velo" onMouseDown={onCerrar}><form className="hoja-atajos dialogo-herramienta" role="dialog" aria-label="Importar imagen" aria-modal="true" onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape')onCerrar()}} onSubmit={e=>{
    e.preventDefault()
    try {
      const valores=Object.fromEntries(Object.entries(campos).map(([k,v])=>[k,numeroHerramienta(v)])) as Record<keyof typeof campos,number>
      if(!datos || valores.ancho<=0 || valores.alto<=0 || valores.opacidad<0 || valores.opacidad>1)throw new Error('Dimensiones positivas y opacidad entre 0 y 1')
      onImportar({datos,...valores})
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  }}><header className="hoja-atajos-cabeza"><b>Imagen de fondo calibrada</b><button type="button" onClick={onCerrar}>×</button></header><div className="dialogo-herramienta-cuerpo">
    <p>Indica la esquina inferior izquierda y las dimensiones en unidades de la escena.</p>
    <input aria-label="Archivo de imagen" type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{
      const f=e.target.files?.[0];if(!f)return
      if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5_000_000){setError('Usa PNG, JPEG o WebP de hasta 5 MB');return}
      try {
        const imagen=await createImageBitmap(f)
        setCampos(c=>({...c,alto:String(10*imagen.height/imagen.width)}));imagen.close()
        const reader=new FileReader();reader.onload=()=>{setDatos(String(reader.result));setError('')};reader.readAsDataURL(f)
      }catch{setError('No se pudo leer la imagen')}
    }} />
    {datos&&<img src={datos} alt="Vista previa" style={{maxWidth:'100%',maxHeight:150,objectFit:'contain'}} />}
    {Object.entries({x:'X',y:'Y',ancho:'Anchura',alto:'Altura',opacidad:'Opacidad'}).map(([k,t])=><label key={k}>{t}<input value={campos[k as keyof typeof campos]} onChange={e=>setCampos(c=>({...c,[k]:e.target.value}))}/></label>)}
    {error&&<p role="alert">{error}</p>}<button disabled={!datos}>Añadir imagen a la escena</button>
  </div></form></div>
}
