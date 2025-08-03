import React, { useState } from 'react';

const AuthLogin = ({ onLogin, onSwitchView }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-cyan-300 to-emerald-300 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo agregado aquí */}
        <img
          src="/assets/84427232.svg"
          alt="Logo FCAquaLink"
          className="w-60 h-auto mx-auto mb-4"
        />
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Universidad Mariano Galvez Guatemala
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Ingeniería en Sistemas de Información y Ciencias de la Computación
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-2xl rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo Electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Iniciar Sesión
              </button>
            </div>
          </form>
          <div className="mt-6 text-center">
            <button
              onClick={() => onSwitchView('register')}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Crear una cuenta
            </button>
            <span className="mx-2 text-gray-400">|</span>
            <button
              onClick={() => onSwitchView('reset')}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Olvidé mi contraseña
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLogin;
