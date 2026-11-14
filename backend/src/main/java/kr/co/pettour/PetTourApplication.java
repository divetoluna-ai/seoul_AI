package kr.co.pettour;

import jakarta.servlet.SessionTrackingMode;
import java.net.URI;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.ServletContextInitializer;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@org.springframework.cache.annotation.EnableCaching
public class PetTourApplication {

	@Bean
	ServletContextInitializer authSessionCookies(@Value("${kakao.login.redirect-uri}") String redirectUri) {
		boolean secure = "https".equals(URI.create(redirectUri.strip()).getScheme());
		return context -> {
			context.setSessionTrackingModes(Set.of(SessionTrackingMode.COOKIE));
			var cookie = context.getSessionCookieConfig();
			cookie.setName(AuthController.SESSION_COOKIE);
			cookie.setPath(AuthController.COOKIE_PATH);
			cookie.setHttpOnly(true);
			cookie.setSecure(secure);
			cookie.setAttribute("SameSite", "Lax");
		};
	}

	public static void main(String[] args) {
		SpringApplication.run(PetTourApplication.class, args);
	}

}
