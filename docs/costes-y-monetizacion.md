# Qué cuesta una historia, y cómo recuperarlo

Análisis del gasto real en API por vídeo generado con TVPHI. Las **cantidades**
están medidas sobre el código de este repositorio; los **precios** son las
tarifas públicas de OpenAI de agosto de 2026. Al final, qué hacer para que salga
rentable.

Fecha del análisis: agosto de 2026 · rama `main`

---

## Lo primero, porque cambia la pregunta

La pregunta era cómo **reducir el gasto en tokens**. La respuesta medida es que
eso no sirve de nada:

| parte | coste de un TikTok de 60 s | peso |
|---|---:|---:|
| Imágenes | $0.205 | **91%** |
| Voz | $0.015 | 7% |
| Texto (el guion entero) | $0.004 | **2%** |

Escribir el guion cuesta **cuatro milésimas de dólar**. Aunque se recortara el
catálogo de efectos un 70% —que es el 83% de lo que se le manda al modelo— se
ahorrarían **$0.0013 por historia**: trece céntimos cada cien vídeos. No merece
la pena tocarlo, y menos a costa de que el modelo invente efectos que no
existen.

**El gasto son las imágenes.** Todo lo que sigue va de eso.

---

## Lo que se mide en el código

| dato | valor | de dónde sale |
|---|---:|---|
| Catálogo de efectos enviado en cada generación | 33 537 car | `referenciaCompacta()` serializado |
| Instrucciones del capítulo | 5 847 car | `INSTRUCCIONES` en `/api/story/ia/capitulo` |
| Instrucción del mapa 2.5D | 2 553 car | `INSTRUCCION` en `/api/story/ia/lab/escena` |
| Entrada por capítulo | ~10 969 tokens | suma de lo anterior + encargo |
| Imágenes por escena (plano) | 1 | `/api/story/ia/imagen`, calidad media |
| Imágenes por escena (2.5D) | 3–5 | una por capa dibujable |
| Ritmo observado | ~13,3 s por escena | medido en una generación real: 6 escenas ≈ 80 s |

La entrada de texto **no cambia con la duración**: son los mismos ~11 000 tokens
para un vídeo de 30 s que para uno de 10 minutos. Lo que crece es la salida, y
la salida es barata.

### Precios usados

| concepto | tarifa |
|---|---|
| `gpt-5.6-luna` entrada / salida | $0.20 / $1.20 por millón de tokens |
| `gpt-image-2`, 1024×1536, calidad media | ~$0.041 por imagen |
| Edición de imagen (2.5D: se manda el mapa) | ~$0.056 por imagen |
| `gpt-4o-mini-tts` | ~$0.015 por minuto de audio |

`gpt-5.6-luna` bajó un 80% de precio el 30 de julio de 2026. Si el análisis se
lee mucho después, esta tabla es lo primero que hay que revisar.

Una cifra es estimada y conviene saberlo: **3,7 caracteres por token**. El
contexto es JSON mezclado con español y ahí el tokenizador ronda ese valor. Como
el texto es el 2% del total, equivocarse un 20% en esa cifra mueve el resultado
final un 0,4%.

---

## Coste por historia

### Como funciona hoy (una imagen por escena)

| duración | escenas | capítulos | imágenes | texto | imágenes | voz | **total** |
|---|---:|---:|---:|---:|---:|---:|---:|
| 30 s | 2 | 1 | 2 | $0.003 | $0.082 | $0.007 | **$0.093** |
| 60 s | 5 | 1 | 5 | $0.004 | $0.205 | $0.015 | **$0.224** |
| 3 min | 14 | 2 | 14 | $0.010 | $0.574 | $0.045 | **$0.629** |
| 10 min | 45 | 4 | 45 | $0.028 | $1.845 | $0.150 | **$2.023** |

«Capítulos» son generaciones separadas: el deslizador corta en **12 escenas**, así
que un vídeo de 3 minutos ya obliga a dos, y uno de 10 minutos a cuatro. Eso no
encarece casi nada (el texto es barato) pero sí es trabajo manual de unir y
mantener la continuidad entre capítulos.

### Con el sistema 2.5D de capas (4 capas por escena)

| duración | imágenes | texto | imágenes | voz | **total** | vs. plano |
|---|---:|---:|---:|---:|---:|---:|
| 30 s | 8 | $0.003 | $0.451 | $0.007 | **$0.461** | ×5.0 |
| 60 s | 20 | $0.004 | $1.127 | $0.015 | **$1.146** | ×5.1 |
| 3 min | 56 | $0.010 | $3.154 | $0.045 | **$3.210** | ×5.1 |
| 10 min | 180 | $0.028 | $10.139 | $0.150 | **$10.317** | ×5.1 |

**El 2.5D multiplica el coste por cinco.** Es aritmética simple: cuatro imágenes
en vez de una, y además cada una es una *edición* (se le manda el mapa como
entrada), que se paga aparte.

### Coste por minuto de vídeo terminado

| duración | plano | 2.5D |
|---|---:|---:|
| 30 s | $0.185 /min | $0.922 /min |
| 60 s | $0.224 /min | $1.146 /min |
| 3 min | $0.210 /min | $1.070 /min |
| 10 min | $0.202 /min | $1.032 /min |

Es notablemente plano: **unos 20 centavos por minuto** de vídeo, dure lo que
dure. Eso significa que el vídeo largo no es más caro *por minuto*, y como verás
más abajo, sí es mucho más rentable por minuto.

---

## Las palancas, ordenadas por lo que valen

Sobre un TikTok de 60 s ($0.224):

| medida | coste | cambio |
|---|---:|---:|
| Tal cual está hoy | $0.224 | — |
| **Reusar imagen: 3 tomas por escena en vez de 2** | $0.142 | **−37%** |
| **API Batch (−50% en imágenes)** | $0.122 | **−46%** |
| Las dos cosas juntas | $0.081 | **−64%** |
| Recortar el catálogo un 70% | $0.223 | −1% |

### 1. Más tomas por escena — gratis, y ya está en la app

Cada escena es una imagen; cada **toma** es un encuadre distinto sobre esa misma
imagen, y no cuesta nada. Pasar de 2 a 3 tomas por escena baja el número de
imágenes un tercio para la misma duración. El propio prompt del sistema ya lo
recomienda («varias tomas por escena quedan mejor que una»), pero como consejo
estético, no como ahorro.

Cuidado con pasarse: con 4-5 tomas sobre la misma foto se nota la repetición. La
frontera práctica está en 3, y en escenas con imagen rica (mucho detalle donde
encuadrar) aguanta 4.

### 2. API Batch — la mitad de precio, no está implementado

OpenAI cobra la mitad por las imágenes si se piden por la API de lotes, con la
contrapartida de que puede tardar hasta 24 horas. Para un flujo de «genero hoy,
publico mañana» encaja perfecto; para «genero y veo el resultado ahora», no.

**No está implementado en la app.** Sería una funcionalidad nueva: encolar las
imágenes de un capítulo, guardar el identificador del lote y recogerlas cuando
estén. Es el cambio con mejor relación esfuerzo/ahorro que tiene este proyecto
por delante.

### 3. El 2.5D, selectivo y no en todo

A ×5, poner capas en las 45 escenas de un vídeo de 10 minutos cuesta $10 en vez
de $2. Pero ponerlas **solo en 3 escenas clave** —la de apertura, el giro y el
final— cuesta: 42 escenas planas ($1.72) + 3 con capas ($0.68) = **$2.40**, un
19% más que todo plano, con el impacto visual donde de verdad se mira.

Esa es la forma sensata de estrenar el 2.5D: como recurso de énfasis, no como
modo por defecto.

### 4. Lo que NO merece la pena

- **Recortar el catálogo de efectos**: 13 céntimos cada 100 vídeos, y se paga
  con efectos inventados.
- **Cambiar a un modelo de texto más barato**: ya es el más barato del catálogo
  y supone el 2%. Bajarlo a cero ahorraría $0.004.
- **Bajar la calidad de imagen a `low`**: sí ahorra, pero es justo lo que el
  espectador ve. Antes de tocar esto, agota Batch y el reuso de imágenes.

---

## Cuánto hay que ver para cubrirlo

| dónde | RPM | vistas para cubrir el coste |
|---|---:|---:|
| TikTok / Shorts, tirando a bajo | $0.03 | **7 477** por vídeo de 60 s |
| TikTok / Shorts, canal bien montado | $0.15 | **1 495** por vídeo de 60 s |
| YouTube largo, nicho flojo | $2 | **1 011** por vídeo de 10 min |
| YouTube largo, nicho bueno | $8 | **253** por vídeo de 10 min |

El dato incómodo: **el corto está mucho peor pagado**. El RPM de Shorts está
entre el 3% y el 14% del de vídeo largo, y el reparto también es peor (en
Shorts te quedas el 45%, en largo el 55%). Un vídeo de 10 minutos cuesta 9 veces
más que uno de 60 s pero puede ingresar 60-250 veces más.

### Coste mensual si produces con regularidad

| ritmo | al mes | al año |
|---|---:|---:|
| 1 TikTok al día | $6.73 | $80.75 |
| 3 TikToks al día | $20.19 | $242.26 |
| 1 vídeo de 10 min por semana | $8.09 | $97.10 |
| 1 TikTok al día + 1 largo semanal | $14.82 | $177.85 |

Poner esto en perspectiva importa: **producir a diario cuesta menos que una
suscripción de streaming**. El riesgo económico de este proyecto no es la
factura de OpenAI, es el tiempo.

---

## Cómo recuperar el dinero, y ganar

Ordenado por lo cerca que está de funcionar.

### 1. Vídeo largo antes que corto

Es la decisión de mayor impacto y no cuesta desarrollo. Con los números de
arriba, 1 000 vistas de un vídeo de 10 min pagan lo que 25 000-70 000 vistas de
un TikTok. Usa el corto como lo que es —captación, sale casi gratis— y el largo
como lo que paga.

**Lo que falta en la app:** el deslizador corta en 12 escenas, así que un vídeo
de 10 minutos son 4 generaciones que hay que coser a mano. Subir el tope o
añadir «continuar el capítulo anterior» (pasándole el resumen de lo ya escrito)
es lo que convierte el formato rentable en algo cómodo.

### 2. Cobrar por usar la app

El coste marginal está medido: **$0.22 por vídeo corto, $2 por uno de 10
minutos**. Con eso se puede poner precio con margen real:

- Gratis: 3 vídeos cortos al mes (coste tuyo: $0.67 por usuario que agote).
- $9/mes: 40 cortos o 4 largos (coste tuyo: ~$9 en el peor caso — ajusta al alza
  o limita a 30).
- Por consumo: $0.50 el corto, $4 el largo. Margen 2× sobre coste.

Ya existe el andamiaje de cuota (`STORY_DAILY_LIMIT`, `estadoCupoHistorias`,
exentos por correo), que es la mitad difícil. **Lo que no existe es el cobro**:
no hay ninguna ruta de pago en `src/app/api/`. Habría que integrar una pasarela
y enlazar el plan con la cuota.

### 3. Vender el resultado, no la herramienta

Un vídeo narrado de 10 minutos cuesta $2 de API. Producirlo por encargo se paga
entre dos y tres cifras según el nicho. Es el camino con mejor margen y el que
menos desarrollo necesita: ya funciona hoy.

### 4. El 2.5D como diferenciador de pago

Es lo único que la competencia de «vídeo faceless con IA» no está haciendo, y
tienes el coste medido: $0.68 por tres escenas con capas. Como extra de pago
—«escenas con profundidad»— tiene margen de sobra y una demo que se entiende en
tres segundos.

### 5. Lotes nocturnos

Si implementas Batch y produces de noche, el coste baja un 46% sin tocar la
calidad. Sobre el escenario «1 TikTok al día + 1 largo semanal», eso son $82 al
año que te quedas.

---

## Resumen en cinco líneas

1. Los tokens de texto son el **2%**: optimizarlos no cambia nada.
2. Las imágenes son el **91%**: ahí está todo el ahorro posible.
3. Las dos palancas reales son **más tomas por imagen** (ya disponible, −37%) y
   **API Batch** (por implementar, −46%).
4. El **2.5D cuesta ×5**: úsalo en las escenas clave, no en todas.
5. **El vídeo largo paga entre 60 y 250 veces mejor** que el corto por dólar
   gastado.

---

## Fuentes de los precios

- [OpenAI API Pricing 2026 — GPT-5.6, GPT-5.5 y costes de Codex (DevTk.AI)](https://devtk.ai/en/blog/openai-api-pricing-guide-2026/)
- [GPT Image 2 Pricing in 2026: What Teams Pay (WaveSpeed)](https://wavespeed.ai/blog/posts/gpt-image-2-pricing-2026/)
- [GPT Image 2 API Price: Official Cost Per Image (YingTu)](https://yingtu.ai/en/blog/gpt-image-2-cost-per-image)
- [OpenAI TTS Pricing 2026: tts-1 vs tts-1-hd vs gpt-4o-mini-tts (TextToLab)](https://texttolab.com/blog/openai-tts-pricing)
- [YouTube Shorts RPM vs long-form: datos de 274 canales (AIR Media-Tech)](https://air.io/en/air-data-findings/youtube-shorts-rpm-vs-long-form-how-much-do-shorts-earn-in-2026)
- [Long-Form vs Shorts Revenue 2026: $3 RPM vs $0.05 RPM (FluxNote)](https://fluxnote.io/guides/youtube-long-form-vs-shorts-revenue)
