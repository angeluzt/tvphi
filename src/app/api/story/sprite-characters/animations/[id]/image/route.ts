import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reconstruirTiraAnimacion } from "@/lib/lab/atlas-sprite.server";
export async function GET(_r:Request,{params}:{params:{id:string}}){
 const u=await getCurrentUser(); if(!u)return new NextResponse("No autorizado",{status:401});
 const a=await prisma.spriteAnimation.findFirst({where:{id:params.id,character:{userId:u.id}},select:{tira:true,atlasFrames:true,fotogramas:true,ancho:true,alto:true}});
 if(!a)return new NextResponse("No encontrado",{status:404});
 try { const tira=await reconstruirTiraAnimacion({userId:u.id,...a}); return new NextResponse(new Uint8Array(tira),{headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300"}}); }
 catch{return new NextResponse("Imagen incompleta",{status:500});}
}
