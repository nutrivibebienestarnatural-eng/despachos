// api/_lib/sellerIds.js — ID de vendedor de ML de cada marca que vende por Flex.
// Mismo número que usa index.html en VENDEDOR_ML para detectar la marca en las etiquetas.
// Se usa este ID fijo en vez del "user_id" que devuelve el login porque si quien conecta la
// cuenta es un colaborador (o, como pasó, alguien con la cuenta equivocada), Mercado Libre
// rechaza igual /orders/search si el "seller" no es exactamente el dueño real de la cuenta.

module.exports = {
  nutrivibe: "3177810946",
  suplemundo: "3660784748",
};
