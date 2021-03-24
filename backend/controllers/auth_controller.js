const userModel = require("../models/user_model.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto"); //!node.js içinde var kurmaya gerek yok
const nodemailer = require("nodemailer");
const APIError = require("../utils/errors.js");
const Response = require("../utils/response.js");
const {
  createToken,
  createTemporaryToken,
} = require("../middlewares/auth_middleware.js");
const sendEmail = require("../utils/send_mail.js");
const moment = require("moment"); //! tarih işlemleri için
//! işlemleri yazıyoruz
//!istekten gelen değerleri body içinden buluyoruz
//! auth işlemleri
const register = async (req, res) => {
  /*  const avatar = cloudinary.uploader.upload(req.body.avatar, {
    folder: "avatars",
    width: 130,
    crop: "scale",
  }); */
  //!kullanıcıdan alınacak değerler
  const { name, lastname, email, password } = req.body;

  //! gelen mail ila sorgu yapıyoruz
  const userCheck = await userModel.findOne({ email });
  if (userCheck) {
    //! aynı mail daha önce kullanılmış ise bunu reddetmek gerek
    // return res.status(400).json({ message: "Bu kullanıcı zaten var" });
    throw new APIError("Bu kullanıcı zaten var", 401); //! daha önce return kullanıyorduk artık error middleware ile yapıyoruz
  }

  if (password.length < 6) {
    //! uyarı verdirdik
    return res.status(400).json({ message: "Şifre en az 6 karakterli olmalı" });
  }
  //! şifreyi hashledik
  const passwordHash = await bcrypt.hash(password, 10); //! 10 tur sayısı 10 turda hashlenecek

  //! kullanıcı oluşturduk burada hashli passwordu verdik
  const newUser = await userModel
    .create({
      name,
      lastname,
      email,
      password: passwordHash,
      role: "user", //! standart kullanıcı
      //! avatarı yükledikten sonra görselin değerlerini alıyoruz
      //  avatar: { public_id: avatar.public_id, url: avatar.secure_url },
    })
    .then(async (data) => {
      //!Token oluşturuyoruz
      const token = await jwt.sign({ id: data.id }, "SECRETTOKEN", {
        expiresIn: "30d", //! 30gün
      });

      const cookieOptions = {
        httpOnly: true,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days expiration
      };

      return new Response(data, "Kayıt başarılı").created(res);
    })
    .catch(() => {
      throw new APIError("Kullanıcı oluşturulamadı", 401);
      // return res.status(400).json({ message: "Kullanıcı oluşturulamadı" }); //! iptal
    }); //! promise yapısı ile başarılı olup olmadığını görelim
};

const login = async (req, res) => {
  //!kullanıcıdan alınacak değerler
  const { email, password } = req.body;

  //! user ile userModel yeri aynı isim olsa hata alırdık
  const user = await userModel.findOne({ email: email }); //! tek email yazsakta olur veya req.body.email de olur

  if (!user) {
    //! bulunamadı ise
    throw new APIError("Email veya şifre yanlış", 401);
    //return res.status(400).json({ message: "Kullanıcı bulunamadı" });
  }
  //! çözümleme yapıyoruz
  //! bcrypt ile şifreleri karşılaştırıyoruz
  const comparePasswords = await bcrypt.compare(password, user.password);
  if (!comparePasswords) {
    //! Şifre yanlış ise
    throw new APIError("Email veya şifre yanlış", 401);

    //! throw ile değiştirdik
    //return res.status(401).json({ message: "Email veya şifre yanlış" });
  }
  /* //!iptal ettik middleware içinde yapıyoruz aşağıya createToken olarak ekledik
  //!Token oluşturuyoruz
  const token = await jwt.sign({ id: user._id }, "SECRETTOKEN", {
    expiresIn: "120m",
  });

  const cookieOptions = {
    httpOnly: true,
    expires: new Date(Date.now() + 50000 * 24 * 60 * 60 * 1000), //!sanırım geçerlilik süresi ben 50 gün yaptım
  };

  res
    .status(201)
    .cookie("token", token, cookieOptions) //! cookilere tokenı "token" olarak kaydettik
    .json({ token }); //! userda vardı çıkarttık {user, token } 
    */

  createToken(user, res); //!middleware içinde yapıyoruz
};
const logout = async (req, res) => {
  const cookieOptions = {
    httpOnly: true,
    expires: new Date(Date.now()), //!geçerlilik süresini şuan diye belirledim
  };
  res
    .status(200)
    .cookie("token", null, cookieOptions)
    .json({ message: "Çıkış işlemi başarılı" });
};
const forgotPassword = async (req, res) => {
  //! önce user kontrol edilir
  //!kullanıcı tarafından gelen mail ile user var mı diye baktık
  const user = await userModel
    .findOne({ email: req.body.email })
    .select("name lastname email"); //!

  if (!user) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  //! crypto üzerinden

  const resetToken = crypto.randomBytes(20).toString("hex"); //!rastgele bir kod oluşur. random değer hex olarak çevrilir

  //! reset password url oluşturuyoruz
  const passwordUrl = `${req.protocol}://${req.get(
    "host"
  )}/reset/${resetToken}`;

  //! node mailer ile gönderilecek mesaj
  const message = `Linke tıklayarak şifrenizi sıfırlayabilirsiniz.  ${passwordUrl}`; //! html sayfada gönderilebilir burada

  const mailOptions = {
    from: process.env.EMAIL_ADDRESS,
    to: req.body.email,
    subject: "Şifre Sıfırlama",
    text: message,
  };
  await sendEmail(mailOptions);
  console.log("dfsfuser", user),
    //!oluşturulan reset token hashlenip code oluyor bunu userda güncelliyoruz
    await user.updateOne(
      { email },
      {
        reset: {
          code: resetToken, //!alttaki methodla yapmak gerekir
          // code:  crypto.createHash("sha256").update(resetToken).digest("hex"),
          time: Date.now() + 15 * 60 * 1000,
          //time: moment(new Date()).add(15, "minutes").format("YYYY-MM-DD HH:mm:ss"), //! şuandan 15 dk sonrasına kadar geçerli olacak şekilde belirtilen formatta aktarılıyor
        },
      }
    );

  return new Response(true, "Mail gönderildi").success(res);
};

const resetPassword = async (req, res) => {
  //!gelen bağlantıdan tıkladıktan sonra kodu sorgulayıp geçerli olup olmadığını kontrol ediyoruz
  //! mail =>tgeçici token =>
  /*  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex"); */
  //!hangi kullanıcının şifresi değişecek onu bulacağız
  const { email, code } = req.body;
  const user = await userModel
    .findOne({
      email,
    })
    .select("_id name lastname email reset");

  if (!user) {
    //! user bulunamaz ise
    throw new APIError("Kullanıcı bulunamadı", 401); //! kullanıcı yok
  }

  const dbTime = moment(user.reset.time);
  const nowTime = moment(new Date());

  const timeDiff = dbTime.diff(nowTime, "minutes"); //! zaman farkı
  console.log("timeDiff", timeDiff);

  if (timeDiff < 0 || user.reset.code === code) {
    throw new APIError("Kod süresi geçmiş", 401); //! kullanıcı yok
  }

  const temporaryToken = await createTemporaryToken(user._id, user.email);

  return new Response(temporaryToken, "Şifre sıfırlama başarılı").success(res);
  //! user objesinde değişiklik yapıyoruz
  user.password = req.body.password;
  user.resetPasswordExpire = undefined;
  user.resetPasswordToken = undefined;
  await user.save(); //! kaydettik
  //!Token oluşturuyoruz
  const token = await jwt.sign({ id: user._id }, "SECRETTOKEN", {
    expiresIn: 120,
  });
  const cookieOptions = {
    httpOnly: true,
    expires: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000), //!sanırım geçerlilik süresi, ben 50 gün yaptım
  };

  res
    .status(201)
    .cookie("token", token, cookieOptions) //! cookilere tokenı "token" olarak kaydettik
    .json({ user, token });
};

const me = async (req, res) => {
  return new Response(req.user).success(res);
};

//! bunları dışarı çıkarıyoruz,
module.exports = {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  me,
};
