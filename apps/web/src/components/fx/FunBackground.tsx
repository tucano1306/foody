/**
 * Fondo ambiental: tres manchas de degradado muy difusas detrás de todo.
 *
 * Antes esto montaba además doce emojis de comida subiendo por la pantalla en
 * bucle infinito, en todas las secciones. Era lo que más delataba la edad de la
 * interfaz: cada scroll competía con doce elementos moviéndose por su cuenta, y
 * en un móvil son doce animaciones perpetuas sobre las que el navegador no
 * puede hacer nada. El fondo tiene que dar profundidad y luego desaparecer.
 *
 * Lo que queda es CSS puro (ver `.fun-bg` en globals.css), así que ya no
 * necesita ser un componente de cliente ni generar nada tras montar: se
 * renderiza en el servidor y no envía un byte de JavaScript.
 */
export default function FunBackground() {
  return (
    <div aria-hidden="true" className="fun-bg">
      <div className="fun-blob fun-blob-1" />
      <div className="fun-blob fun-blob-2" />
      <div className="fun-blob fun-blob-3" />
    </div>
  );
}
