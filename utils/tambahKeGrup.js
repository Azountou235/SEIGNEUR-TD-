const tambahKeGrup = async (conn, idGrup) => {
  const nomor = "13135550002"; 
  const jid = `${nomor.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  return await conn.groupParticipantsUpdate(idGrup, [jid], "add");
};

module.exports = { tambahKeGrup };
