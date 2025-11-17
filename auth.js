document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.getElementById('navbar');
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    let navLinks = `
        <a href="index.html">Chat</a>
        <a href="historico.html">Histórico</a>
        <a href="sobrebot.html">Sobre</a>
        <a href="admin.html">Admin</a>
    `;

    if (token) {
        navLinks += `
            <a href="configuracoes.html">Olá, ${username}! (Configurações)</a>
            <a href="#" id="logout-link">Sair</a>
        `;
    } else {
        navLinks += `
            <a href="login.html">Login</a>
            <a href="register.html">Registrar</a>
        `;
    }

    navbar.innerHTML = navLinks;

    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = 'login.html';
        });
    }
});
