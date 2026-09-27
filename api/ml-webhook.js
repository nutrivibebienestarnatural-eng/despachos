// api/ml-webhook.js — URL de "Notificaciones callbacks" que pide Mercado Libre al crear la app.
// No la usamos: esta integración trae los pedidos a demanda (botón "Traer pedidos de Mercado
// Libre"), no por notificaciones push. Este endpoint solo existe para que ML tenga algo que
// responda 200 OK si igual llega a mandar algo — así no queda registrado como "callback caído".

module.exports = async (req, res) => {
  res.status(200).json({ ok: true });
};
