import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { limpiarPaginasAtlasHuerfanas,reconstruirTiraAnimacion } from "@/lib/lab/atlas-sprite.server";
export const dynamic="force-dynamic";
export async function GET(_r:Request,{params}:{params:{id:string}}){
 const u=await getCurrentUser(); if(!u)return NextResponse.json({error:"No autorizado"},{status:401});
 const a=await prisma.spriteAnimation.findFirst({where:{id:params.id,character:{userId:u.id}},include:{character:{select:{id:true,nombre:true}}}});
 if(!a)return NextResponse.json({error:"Animación no encontrada"},{status:404});
 try { const tira=await reconstruirTiraAnimacion({userId:u.id,tira:a.tira,atlasFrames:a.atlasFrames,fotogramas:a.fotogramas,ancho:a.ancho,alto:a.alto});
 return NextResponse.json({animacion:{id:a.id,personajeId:a.character.id,personajeNombre:a.character.nombre,nombre:a.nombre,que:a.que,
 fotogramas:a.fotogramas,fps:a.fps,vista:a.vista,direccion:a.direccion,accion:a.accion,anclaje:a.anclaje,croma:a.croma,
 columnas:a.columnas,filas:a.filas,anchoHoja:a.anchoHoja,altoHoja:a.altoHoja,ancho:a.ancho,alto:a.alto,celdas:a.celdas,
 hojaOriginal:Buffer.from(a.hojaOriginal).toString("base64"),hojaTrabajo:Buffer.from(a.hojaTrabajo??a.hojaOriginal).toString("base64"),tira:tira.toString("base64")}});}
 catch{return NextResponse.json({error:"La imagen está incompleta."},{status:500});}
}
export async function DELETE(_r:Request,{params}:{params:{id:string}}){const u=await getCurrentUser();if(!u)return NextResponse.json({error:"No autorizado"},{status:401});
 const a=await prisma.spriteAnimation.findFirst({where:{id:params.id,character:{userId:u.id}},select:{id:true}});if(!a)return NextResponse.json({error:"No encontrada"},{status:404});
 await prisma.spriteAnimation.delete({where:{id:a.id}});await limpiarPaginasAtlasHuerfanas(u.id);return NextResponse.json({ok:true});}
