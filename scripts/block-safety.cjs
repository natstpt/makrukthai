// Validate the intended interposition and every immediate red reply.
module.exports=function(Rules,pieces,from,goals){
 const same=(a,b)=>a.r===b.r&&a.c===b.c;
 if(!Rules.inCheck(pieces,'white')||Rules.inCheck(pieces,'black'))return false;
 return goals.length>0&&goals.every(to=>{
  if(!Rules.legalDestinations(pieces,from).some(p=>same(p,to)))return false;
  const after=Rules.applyMove(pieces,from,to);
  if(Rules.inCheck(after,'white'))return false;
  let captureTested=false;
  for(const reply of Rules.legalMoves(after,'black')){
   const next=Rules.applyMove(after,reply.from,reply.to);
   if(Rules.gameStatus(next,'white').state==='checkmate')return false;
   if(same(reply.to,to)){
    captureTested=true;
    if(!Rules.legalMoves(next,'white').some(move=>same(move.to,to)&&next.some(pc=>pc.side==='white'&&pc.piece==='king'&&same(pc.at,move.from))))return false;
   }
  }
  return captureTested;
 });
};
