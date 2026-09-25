export function descargarTexto(nombre: string, contenido: string, tipo='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([contenido],{type:tipo}))
  const a=document.createElement('a');a.href=url;a.download=nombre;a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

/** RFC 4180: comillas escapadas, campos multilínea, BOM y CRLF. */
export function leerCSV(texto:string, separador=','): string[][] {
  texto=texto.replace(/^\uFEFF/,'')
  const filas:string[][]=[]
  let fila:string[]=[], campo='', comillas=false
  for(let i=0;i<texto.length;i++) {
    const ch=texto[i]
    if(ch==='"') {
      if(comillas && texto[i+1]==='"') {campo+='"';i++}
      else if(comillas || !campo) comillas=!comillas
      else throw new Error('Comillas fuera del comienzo de un campo')
    } else if(!comillas && ch===separador) {fila.push(campo);campo=''}
    else if(!comillas && (ch==='\n'||ch==='\r')) { if(ch==='\r'&&texto[i+1]==='\n')i++;fila.push(campo);if(fila.some(c=>c.trim()))filas.push(fila);fila=[];campo='' }
    else campo+=ch
  }
  if(comillas)throw new Error('Campo entre comillas sin cerrar')
  fila.push(campo);if(fila.some(c=>c.trim()))filas.push(fila)
  return filas
}
export const escaparHTML=(t:string)=>t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
