# Mástil

Cuaderno interactivo de teoría musical para guitarristas: notas del diapasón, tonalidades y escalas, y lectura en pentagrama.

- **Diapasón** — explora el mástil (notas, octavas, misma altura en otras cuerdas) y practica nombrando o encontrando notas.
- **Tonalidades** — círculo de quintas interactivo, armaduras, relativos, fórmula de tonos y semitonos, acordes diatónicos y la escala sobre el mástil.
- **Lectura** — pentagrama ↔ diapasón en ambos sentidos, con ejercicios por niveles.
- **Con tu guitarra** — algunos ejercicios escuchan por el micrófono la nota que tocas.
- Los ejercicios insisten en lo que más fallas; el progreso se guarda en `localStorage`.

## Uso

Es una web estática sin dependencias ni paso de compilación. Para verla en local:

```bash
python3 -m http.server 8000
```

Para publicarla en GitHub Pages: *Settings → Pages → Deploy from a branch*, rama principal, carpeta `/ (root)`.

## Versión artifact y app de Mac

La web también se publica como *artifact* de Claude (una sola página con todo incrustado) y, desde la app de escritorio de Claude, se instala como app con ventana e icono propios (menú del artifact → *Install as app*, o el botón «Instalar como app» de la barra superior).

```bash
cd tools && npm install && npm run artifact   # genera dist/artifact/index.html
```

Dentro de un artifact Claude no concede el micrófono: los ejercicios «con tu guitarra» solo funcionan en la versión web.

Tipografías: Fraunces, Instrument Sans y Noto Music (SIL Open Font License).
